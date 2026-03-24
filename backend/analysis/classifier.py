"""Substantiveness classification using OpenAI GPT-4o with CIS Agentic Pipeline.

Uses parallel async requests for speed. Each comment is written to Neo4j
immediately after classification (streaming, resumable).
"""

import asyncio
import json
import re
import uuid
from openai import AsyncOpenAI
from config import get_settings
from graph import (
    run_write, upsert_legal_citation, upsert_economic_claim,
)

CLASSIFICATION_SYSTEM_PROMPT = """You are an AI-powered federal rulemaking analysis assistant for Public Comment Intelligence.
You classify public comments submitted under the Administrative Procedure Act (APA).

CLASSIFICATION CATEGORIES:
1. LEGAL ("legal") — Cites statutes, case law, executive orders, constitutional provisions
2. POLICY ("policy") — Identifies policy consequences, trade-offs, or alternatives
3. ECONOMIC ("economic") — Presents data/estimates about economic effects
4. TECHNICAL ("technical") — Identifies factual/scientific/technical errors or provides new data
5. ANECDOTAL ("anecdotal") — Shares personal/organizational experience relevant to rule impact
6. NON-SUBSTANTIVE ("non_substantive") — General support/opposition without engaging specifics

RULES:
- A comment may receive MULTIPLE labels
- Evaluate HOW the argument is made, NEVER what position it takes
- Err toward more substantive classification when uncertain
- Viewpoint neutrality is paramount

For EACH comment, follow this CIS Agentic Pipeline:
1. INITIAL READ: What is the commenter's main point? (1 sentence)
2. PROVISION ENGAGEMENT: Does the comment reference specific provisions? (Yes/No + which)
3. EVIDENCE SCAN: What types of evidence? (legal citations, data, studies, personal experience, none)
4. LEGAL ANALYSIS: Specific legal standard or authority cited? (Cite or "None")
5. ECONOMIC ANALYSIS: Economic claims? Quantitative or qualitative? (Describe or "None")
6. TECHNICAL ANALYSIS: Technical/scientific information? (Describe or "None")
7. POLICY ANALYSIS: Policy alternatives or consequences? (Describe or "None")
8. CLASSIFICATION: Assign label(s) with confidence (0.0-1.0)
9. UNCERTAINTY FLAG: What could change this classification?

Also extract:
- STANCE: The commenter's position on the proposed rule. Must be exactly one of:
  "support" — commenter supports the rule (even with suggested modifications)
  "oppose" — commenter opposes the rule
  "conditional" — commenter supports parts but opposes others, or supports only with specific changes
  "neutral" — commenter does not take a clear position (e.g., requesting extension, providing data without opinion)
- COMMENTER_TYPE: Infer from the comment text who is writing. Must be exactly one of:
  "government" — federal, state, local government entity, water utility, municipal authority
  "trade_association" — industry association, coalition, federation, chamber of commerce
  "organization" — company, nonprofit, NGO, advocacy group
  "academic" — university, research institution, professor, scientist
  "law_firm" — law firm, attorney, legal counsel
  "individual" — private citizen, concerned resident
  Look for phrases like "on behalf of", "the City of", "our association", "as a professor at", etc.
- LEGAL_CITATIONS: Any statutes, cases, regulations, executive orders cited
- ECONOMIC_CLAIMS: Any economic/cost/benefit claims with amounts if present

Respond in JSON format only."""

CLASSIFICATION_USER_TEMPLATE = """Classify this public comment on the proposed rule "{rule_title}":

COMMENT ID: {comment_id}
COMMENT TEXT:
{comment_text}

Respond with this exact JSON structure:
{{
  "comment_id": "{comment_id}",
  "chain_of_thought": {{
    "initial_read": "...",
    "provision_engagement": "...",
    "evidence_scan": ["..."],
    "legal_analysis": "...",
    "economic_analysis": "...",
    "technical_analysis": "...",
    "policy_analysis": "...",
    "uncertainty_flag": "..."
  }},
  "classifications": [
    {{
      "label": "legal|policy|economic|technical|anecdotal|non_substantive",
      "confidence": 0.0,
      "evidence": ["excerpt from comment..."],
      "reasoning": "..."
    }}
  ],
  "primary_label": "...",
  "primary_confidence": 0.0,
  "provisions_referenced": ["..."],
  "stance": "support|oppose|conditional|neutral",
  "commenter_type": "government|trade_association|organization|academic|law_firm|individual",
  "legal_citations": [
    {{
      "citation_text": "...",
      "citation_type": "statute|case_law|exec_order|regulation|constitutional",
      "context": "..."
    }}
  ],
  "economic_claims": [
    {{
      "claim_text": "...",
      "claim_type": "cost|benefit|market_impact|employment|compliance_cost",
      "quantitative": true,
      "amount": "$X" or null
    }}
  ]
}}"""


def _parse_response(response_text: str, comment_id: str) -> dict:
    """Parse JSON from model response, handling markdown code blocks."""
    json_match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
    if json_match:
        response_text = json_match.group(1)
    else:
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {
            "comment_id": comment_id,
            "classifications": [{"label": "non_substantive", "confidence": 0.3,
                                 "evidence": [], "reasoning": "Failed to parse model response"}],
            "primary_label": "non_substantive",
            "primary_confidence": 0.3,
            "chain_of_thought": {"initial_read": "Parse error", "uncertainty_flag": "High"},
            "legal_citations": [],
            "economic_claims": [],
            "stance": "neutral",
            "commenter_type": "individual",
            "provisions_referenced": [],
        }


def write_classification_to_graph(comment_id: str, classification: dict):
    """Write classification results to Neo4j Comment node and create
    LegalCitation and EconomicClaim nodes with edges."""

    labels = [c["label"] for c in classification.get("classifications", [])]
    confidences = [c["confidence"] for c in classification.get("classifications", [])]
    primary = classification.get("primary_label", "non_substantive")
    primary_conf = classification.get("primary_confidence", 0.0)
    cot = json.dumps(classification.get("chain_of_thought", {}))

    stance = classification.get("stance", "neutral")
    if stance not in ("support", "oppose", "conditional", "neutral"):
        stance = "neutral"

    commenter_type = classification.get("commenter_type", "individual")
    valid_types = ("government", "trade_association", "organization", "academic", "law_firm", "individual")
    if commenter_type not in valid_types:
        commenter_type = "individual"

    run_write("""
        MATCH (c:Comment {comment_id: $cid})
        SET c.substantiveness_labels = $labels,
            c.substantiveness_confidences = $confidences,
            c.primary_label = $primary,
            c.primary_confidence = $primary_conf,
            c.chain_of_thought = $cot,
            c.stance = $stance
    """, dict(
        cid=comment_id, labels=labels, confidences=confidences,
        primary=primary, primary_conf=primary_conf, cot=cot, stance=stance,
    ))

    # Update Commenter node with inferred type
    run_write("""
        MATCH (c:Comment {comment_id: $cid})-[:SUBMITTED_BY]->(cm:Commenter)
        SET cm.commenter_type = $ctype
    """, dict(cid=comment_id, ctype=commenter_type))

    if primary_conf < 0.6:
        run_write("""
            MATCH (c:Comment {comment_id: $cid})
            SET c.needs_human_review = true,
                c.review_reason = 'low_confidence_classification'
        """, dict(cid=comment_id))

    for citation in classification.get("legal_citations", []):
        if not citation.get("citation_text"):
            continue
        cit_id = str(uuid.uuid4())[:8]
        upsert_legal_citation(
            citation_id=cit_id, comment_id=comment_id,
            citation_text=citation["citation_text"],
            citation_type=citation.get("citation_type", "unknown"),
            context_excerpt=citation.get("context", ""),
        )

    for claim in classification.get("economic_claims", []):
        if not claim.get("claim_text"):
            continue
        claim_id = str(uuid.uuid4())[:8]
        upsert_economic_claim(
            claim_id=claim_id, comment_id=comment_id,
            claim_text=claim["claim_text"],
            claim_type=claim.get("claim_type", "unknown"),
            quantitative=claim.get("quantitative", False),
            amount=claim.get("amount", ""),
            methodology_cited=False,
        )


async def classify_comment_async(
    client: AsyncOpenAI,
    comment_id: str,
    comment_text: str,
    rule_title: str,
    semaphore: asyncio.Semaphore,
) -> dict:
    """Classify a single comment asynchronously."""
    text = comment_text[:6000] if len(comment_text) > 6000 else comment_text

    async with semaphore:
        try:
            response = await client.chat.completions.create(
                model=get_settings().openai_model,
                max_tokens=1500,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": CLASSIFICATION_SYSTEM_PROMPT},
                    {"role": "user", "content": CLASSIFICATION_USER_TEMPLATE.format(
                        comment_id=comment_id,
                        comment_text=text,
                        rule_title=rule_title,
                    )},
                ],
            )
            response_text = response.choices[0].message.content or ""
            return _parse_response(response_text, comment_id)
        except Exception as e:
            return {
                "comment_id": comment_id,
                "classifications": [{"label": "non_substantive", "confidence": 0.3,
                                     "evidence": [], "reasoning": f"Error: {e}"}],
                "primary_label": "non_substantive",
                "primary_confidence": 0.3,
                "chain_of_thought": {"uncertainty_flag": str(e)},
                "legal_citations": [], "economic_claims": [],
                "stance": "neutral", "commenter_type": "individual",
            }


async def classify_batch_async(
    comments: list[dict],
    rule_title: str = "the proposed rule",
    concurrency: int = 8,
) -> list[dict]:
    """Classify a batch of comments with parallel async requests.

    Each result is written to Neo4j immediately (streaming).
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    semaphore = asyncio.Semaphore(concurrency)
    results = []
    total = len(comments)
    completed = 0

    async def process_one(comment: dict):
        nonlocal completed
        cid = comment["comment_id"]
        body = comment.get("body", "")

        if not body or len(body.strip()) < 5:
            result = {
                "comment_id": cid,
                "classifications": [{"label": "non_substantive", "confidence": 0.95,
                                     "evidence": [], "reasoning": "Empty comment"}],
                "primary_label": "non_substantive",
                "primary_confidence": 0.95,
                "chain_of_thought": {},
                "legal_citations": [], "economic_claims": [],
                "stance": "neutral", "commenter_type": "individual",
            }
        else:
            result = await classify_comment_async(client, cid, body, rule_title, semaphore)

        # Write immediately to Neo4j
        write_classification_to_graph(cid, result)
        completed += 1
        if completed % 10 == 0 or completed == total:
            print(f"[classifier] {completed}/{total} classified")
        return result

    # Process in batches to show progress
    batch_size = 20
    for i in range(0, total, batch_size):
        batch = comments[i:i + batch_size]
        batch_results = await asyncio.gather(*[process_one(c) for c in batch])
        results.extend(batch_results)

    return results


# Sync wrapper for pipeline compatibility
def classify_batch(
    comments: list[dict],
    rule_title: str = "the proposed rule",
    batch_size: int = 1,  # Ignored — kept for API compatibility
) -> list[dict]:
    """Sync wrapper that runs async parallel classification."""
    print(f"[classifier] Starting parallel classification of {len(comments)} comments (8 concurrent)...")
    return asyncio.run(classify_batch_async(comments, rule_title, concurrency=8))
