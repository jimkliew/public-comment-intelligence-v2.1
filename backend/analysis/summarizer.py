"""Executive summary generation using OpenAI GPT-4o.

Generates a plain-English summary of:
1. What regulation is being commented on and why it matters
2. Key themes and arguments from public comments
3. Stance breakdown (support/oppose/conditional)
4. Notable findings (novel arguments, legal challenges, economic concerns)
"""

from openai import OpenAI
from config import get_settings
from graph import run_query, run_write


SUMMARY_SYSTEM = """You are an expert federal regulatory analyst writing an executive briefing for senior Fed officials.

STYLE RULES:
- Use standard Gov't abbreviations: EPA, DOT, HHS, OSHA, FAA, etc. Never spell out agency names.
- Use "Gov't" not "Government". Use "NPDWR" not "National Primary Drinking Water Regulation".
- Use "PFAS" not "per- and polyfluoroalkyl substances" after first mention.
- Keep each section to 1-2 sentences MAX. Decision-makers scan, they don't read.
- Lead with the number, then the insight. e.g. "284 comments support the rule — mostly individuals citing health concerns."
- No filler. No "it is important to note." No "the agency should consider." Just state facts.
- Bold section headers with ** markers.
- Total summary must be under 200 words."""


def generate_executive_summary(docket_id: str) -> str:
    """Generate an executive summary for a docket using OpenAI GPT-4o.

    Pulls all analysis results from Neo4j and sends to GPT-4o for synthesis.
    Stores the result on the Docket node.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        return ""

    # Gather data from Neo4j
    docket = run_query("""
        MATCH (d:Docket {docket_id: $did})
        OPTIONAL MATCH (d)<-[:ISSUED_BY]-(a:Agency)
        RETURN d.title AS title, d.abstract AS abstract,
               d.rin AS rin, a.name AS agency
    """, dict(did=docket_id))

    if not docket:
        return ""

    d = docket[0]

    # Stats
    stats = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        RETURN count(c) AS total,
               count(CASE WHEN c.is_duplicate = true THEN 1 END) AS duplicates,
               count(CASE WHEN c.is_stub = true THEN 1 END) AS stubs,
               count(CASE WHEN c.primary_label IS NOT NULL THEN 1 END) AS classified,
               count(CASE WHEN c.needs_human_review = true THEN 1 END) AS needs_review
    """, dict(did=docket_id))

    # Themes
    themes = run_query("""
        MATCH (c:Comment)-[:HAS_THEME]->(t:Theme)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH t, count(c) AS cnt
        RETURN t.label AS theme, t.keywords AS keywords, cnt
        ORDER BY cnt DESC LIMIT 10
    """, dict(did=docket_id))

    # Substantiveness
    labels = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.primary_label IS NOT NULL
        RETURN c.primary_label AS label, count(c) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Stance
    stance = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.stance IS NOT NULL
        RETURN c.stance AS stance, count(c) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Top CIS comments
    top_comments = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.impact_score IS NOT NULL
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN c.comment_id AS id, c.impact_score AS cis, c.impact_tier AS tier,
               c.primary_label AS label, substring(c.body, 0, 300) AS excerpt,
               cm.organization AS org, cm.commenter_type AS type
        ORDER BY c.impact_score DESC LIMIT 5
    """, dict(did=docket_id))

    # Legal citations
    legal = run_query("""
        MATCH (c:Comment)-[:CITES_LEGAL]->(lc:LegalCitation)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN lc.citation_text AS citation, count(c) AS cited_by
        ORDER BY cited_by DESC LIMIT 10
    """, dict(did=docket_id))

    # Commenter types
    commenters = run_query("""
        MATCH (c:Comment)-[:SUBMITTED_BY]->(cm:Commenter)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN cm.commenter_type AS type, count(DISTINCT cm) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Build prompt
    prompt = f"""Write an executive summary for this federal rulemaking docket.

DOCKET: {docket_id}
RULE TITLE: {d.get('title', 'Unknown')}
AGENCY: {d.get('agency', 'Unknown')}
RIN: {d.get('rin', 'N/A')}
ABSTRACT: {(d.get('abstract') or 'Not available')[:1000]}

COMMENT STATISTICS:
{stats[0] if stats else 'No data'}

THEMES DISCOVERED (by comment count):
{chr(10).join(f"- {t['theme']} ({t['cnt']} comments, keywords: {t.get('keywords', [])})" for t in themes) if themes else 'None'}

SUBSTANTIVENESS BREAKDOWN:
{chr(10).join(f"- {lbl['label']}: {lbl['count']}" for lbl in labels) if labels else 'None'}

STANCE ANALYSIS:
{chr(10).join(f"- {s['stance']}: {s['count']}" for s in stance) if stance else 'Not available'}

TOP 5 HIGHEST-IMPACT COMMENTS (use these exact comment IDs in action items):
{chr(10).join(f"- {c['id']} (CIS={c['cis']}): [{c.get('type','?')}] {c.get('org','individual')} — {c.get('excerpt','')[:150]}" for c in top_comments) if top_comments else 'None'}

LEGAL CITATIONS FOUND:
{chr(10).join(f"- {c['citation']} (cited by {c['cited_by']} comments)" for c in legal) if legal else 'None'}

COMMENTER TYPES:
{chr(10).join(f"- {c['type']}: {c['count']}" for c in commenters) if commenters else 'None'}

Write a polished executive briefing. This will be the FIRST thing a senior Fed official reads.

Write ONE flowing paragraph of 3-5 sentences. No headers, no bullets, no bold markers for this paragraph. Just clean, polished prose that a Deputy Administrator would read aloud in a meeting. Cover: what the rule is, how many comments were received, the overall stance, the key issues raised, and what deserves attention. Use abbreviations (EPA, NPDWR, PFAS, Gov't, SDWA). Include specific numbers.

Then after a blank line, write:

**ACTION ITEMS**
2-3 bullet points. Each starts with "Review" and references ACTUAL comment IDs from the data above.
Format comment IDs as [[EPA-HQ-OW-2022-0114-XXXX]] so they can be linked.

RULES:
- The paragraph must read like polished executive prose — no markdown formatting, no section headers.
- 3-5 sentences in the paragraph. Flows naturally.
- EXACTLY 2-3 bullets in ACTION ITEMS.
- Each bullet MUST reference at least one real comment ID in [[double brackets]].
- Under 200 words total."""

    # Call OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    print(f"[summarizer] Generating executive summary for {docket_id}...")
    # gpt-5.4 for executive summary — most capable model for the most visible output
    summary_model = "gpt-5.4"
    try:
        response = client.chat.completions.create(
            model=summary_model,
            messages=[
                {"role": "developer", "content": SUMMARY_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=500,
        )
    except Exception:
        # Fallback to gpt-4o if newer model fails
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,
            temperature=0.2,
        )

    summary = response.choices[0].message.content or ""

    # Store on Docket node
    run_write("""
        MATCH (d:Docket {docket_id: $did})
        SET d.executive_summary = $summary
    """, dict(did=docket_id, summary=summary))

    print(f"[summarizer] Summary generated ({len(summary)} chars)")
    return summary
