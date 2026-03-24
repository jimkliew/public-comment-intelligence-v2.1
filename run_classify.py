#!/usr/bin/env python3
"""Classify and score all unprocessed comments in Neo4j.

Skips ingestion/clustering — runs ONLY on what's already loaded.
Uses parallel async for speed.
"""

import sys
import os
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))


async def main():
    from graph import run_query
    from analysis.classifier import classify_batch_async
    from analysis.scoring import score_batch

    docket_id = sys.argv[1] if len(sys.argv) > 1 else "EPA-HQ-OW-2022-0114"

    # Get rule title
    rule_result = run_query("MATCH (d:Docket {docket_id: $did}) RETURN d.title AS title", dict(did=docket_id))
    rule_title = rule_result[0]["title"] if rule_result else docket_id

    # Get unclassified comments
    comments = run_query("""
        MATCH (c:Comment)
        WHERE c.body IS NOT NULL AND c.body <> ''
          AND (c.is_duplicate IS NULL OR c.is_duplicate = false)
          AND (c.is_stub IS NULL OR c.is_stub = false)
          AND (c.word_count IS NULL OR c.word_count >= 8)
          AND c.primary_label IS NULL
        RETURN c.comment_id AS comment_id, c.body AS body
        ORDER BY c.word_count DESC
    """)

    already = run_query("MATCH (c:Comment) WHERE c.primary_label IS NOT NULL RETURN count(c) AS n")
    print(f"Already classified: {already[0]['n']}")
    print(f"Remaining to classify: {len(comments)}")
    print(f"Using model: {os.environ.get('OPENAI_MODEL', 'gpt-4o')}")
    print()

    if not comments:
        print("Nothing to classify!")
        return

    # Classify (parallel)
    print(f"=== CLASSIFYING {len(comments)} COMMENTS (8 parallel) ===")
    classifications = await classify_batch_async(comments, rule_title=rule_title, concurrency=8)

    # Score all classified comments
    print(f"\n=== SCORING ===")
    scored_comments = run_query("""
        MATCH (c:Comment)
        WHERE c.primary_label IS NOT NULL AND c.impact_score IS NULL
        RETURN c.comment_id AS comment_id
    """)

    if scored_comments:
        # Get clustering info for scoring
        max_cluster = run_query("MATCH (t:Theme) RETURN max(t.comment_count) AS m")
        max_cs = max_cluster[0]["m"] if max_cluster and max_cluster[0]["m"] else 100

        score_batch(
            scored_comments, classifications,
            max_cluster_size=max_cs,
            median_inter_cluster_dist=0.5,
        )

    # Regenerate executive summary
    print(f"\n=== EXECUTIVE SUMMARY ===")
    try:
        from analysis.summarizer import generate_executive_summary
        generate_executive_summary(docket_id)
    except Exception as e:
        print(f"Summary failed: {e}")

    # Final counts
    total = run_query("MATCH (c:Comment) WHERE c.primary_label IS NOT NULL RETURN count(c) AS n")
    scored = run_query("MATCH (c:Comment) WHERE c.impact_score IS NOT NULL RETURN count(c) AS n")
    print(f"\n=== DONE ===")
    print(f"Total classified: {total[0]['n']}")
    print(f"Total scored: {scored[0]['n']}")


if __name__ == "__main__":
    asyncio.run(main())
