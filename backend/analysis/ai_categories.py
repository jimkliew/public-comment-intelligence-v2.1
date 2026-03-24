"""AI Categories — GPT-4o reads comments and creates 5 clear categories.

Each comment gets:
- category: one of exactly 5 categories
- support_score: 1-10 (10 = strongly supports the rule, 1 = strongly opposes)
- credibility_score: 1-10 (10 = expert with data/citations, 1 = vague opinion)
"""

import json
import re
import asyncio
from openai import AsyncOpenAI
from config import get_settings
from graph import run_query, run_write


async def discover_categories(docket_id: str) -> list[dict]:
    """Ask GPT-4o to propose exactly 5 categories."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    sample = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.body IS NOT NULL AND c.body <> '' AND c.word_count > 20
          AND (c.is_stub IS NULL OR c.is_stub = false)
        RETURN substring(c.body, 0, 300) AS excerpt
        ORDER BY c.word_count DESC LIMIT 200
    """, dict(did=docket_id))

    if not sample:
        return []

    rule = run_query("MATCH (d:Docket {docket_id: $did}) RETURN d.title AS title", dict(did=docket_id))
    rule_title = rule[0]["title"] if rule else docket_id

    excerpts = "\n---\n".join([s["excerpt"] for s in sample])

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You categorize public comments on federal rules. Respond in JSON only."},
            {"role": "user", "content": f"""Rule: {rule_title}

Here are 200 comments. Create EXACTLY 5 categories that cover all comments. Each category needs:
- name: 2-3 words, clear to a Fed executive (e.g. "Compliance Costs", "Health Concerns")
- emoji: single emoji that represents this category
- description: 1 short sentence

Comments:
{excerpts}

JSON array of exactly 5:
[{{"name": "...", "emoji": "...", "description": "..."}}]"""},
        ],
        max_tokens=500,
        temperature=0.2,
    )

    text = response.choices[0].message.content or ""
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            cats = json.loads(match.group(0))
            return cats[:5]
        except Exception:
            pass
    return []


async def assign_and_score(docket_id: str, categories: list[dict], concurrency: int = 10) -> int:
    """Assign each comment to a category + score support (1-10) and credibility (1-10)."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    semaphore = asyncio.Semaphore(concurrency)

    cat_list = "\n".join([f"{i+1}. {c['name']}: {c['description']}" for i, c in enumerate(categories)])
    cat_names = [c["name"] for c in categories]

    comments = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.body IS NOT NULL AND c.body <> '' AND c.word_count > 8
          AND (c.is_stub IS NULL OR c.is_stub = false)
          AND (c.is_duplicate IS NULL OR c.is_duplicate = false)
        RETURN c.comment_id AS id, substring(c.body, 0, 400) AS excerpt
    """, dict(did=docket_id))

    assigned = 0

    async def process(comment: dict):
        nonlocal assigned
        async with semaphore:
            try:
                resp = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": f"""Categorize this comment and score it. Respond as JSON only.

Categories:
{cat_list}

Respond exactly: {{"category": "name", "support": N, "credibility": N}}
- category: one of the 5 names above
- support: 1-10 (10=strongly supports the rule, 5=neutral, 1=strongly opposes)
- credibility: 1-10 (10=expert with data/legal citations, 5=reasonable argument, 1=vague/emotional opinion)"""},
                        {"role": "user", "content": comment["excerpt"]},
                    ],
                    max_tokens=60,
                    temperature=0.1,
                )
                text = (resp.choices[0].message.content or "").strip()
                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    data = json.loads(match.group(0))
                    cat = data.get("category", cat_names[0])
                    # Fuzzy match
                    matched = cat_names[0]
                    for cn in cat_names:
                        if cn.lower() in cat.lower() or cat.lower() in cn.lower():
                            matched = cn
                            break

                    support = max(1, min(10, int(data.get("support", 5))))
                    credibility = max(1, min(10, int(data.get("credibility", 5))))

                    run_write("""
                        MATCH (c:Comment {comment_id: $cid})
                        SET c.ai_category = $cat,
                            c.ai_support = $sup,
                            c.ai_credibility = $cred
                    """, dict(cid=comment["id"], cat=matched, sup=support, cred=credibility))

                    assigned += 1
                    if assigned % 50 == 0:
                        print(f"[ai_categories] {assigned}/{len(comments)} scored")
            except Exception:
                pass

    batch_size = 30
    for i in range(0, len(comments), batch_size):
        batch = comments[i:i + batch_size]
        await asyncio.gather(*[process(c) for c in batch])

    print(f"[ai_categories] Done: {assigned}/{len(comments)}")
    return assigned


async def run_ai_categorization(docket_id: str) -> dict:
    """Full pipeline: discover 5 categories, assign + score all comments."""
    print("[ai_categories] Discovering 5 categories...")
    categories = await discover_categories(docket_id)

    if not categories:
        return {"categories": [], "assigned": 0}

    for c in categories:
        print(f"  {c.get('emoji','')} {c['name']}: {c['description']}")

    run_write("MATCH (d:Docket {docket_id: $did}) SET d.ai_categories = $cats",
              dict(did=docket_id, cats=json.dumps(categories)))

    print("[ai_categories] Scoring comments...")
    assigned = await assign_and_score(docket_id, categories)

    return {"categories": categories, "assigned": assigned}
