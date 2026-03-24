"""Master analysis pipeline — orchestrates the full Public Comment Intelligence workflow.

1. Ingest docket data into Neo4j
2. Generate embeddings
3. Run deduplication + campaign detection
4. Run thematic clustering
5. Classify comments (Claude)
6. Compute CIS scores
7. Generate executive summary (OpenAI)
"""

import asyncio
import json
import time
from pathlib import Path

from graph import run_query
from ingestion.orchestrator import ingest_docket
from processing.embeddings import generate_embeddings
from processing.dedup import run_dedup_pipeline
from analysis.clustering import run_clustering
from analysis.scoring import score_batch


async def run_full_pipeline(
    docket_id: str,
    max_comments: int = 1000,
    classify_limit: int | None = None,
    output_dir: str = "data",
) -> dict:
    """Run the complete Public Comment Intelligence analysis pipeline.

    Args:
        docket_id: Regulations.gov docket ID (e.g., "EPA-HQ-OAR-2021-0208")
        max_comments: Max comments to ingest
        classify_limit: Max comments to send through Claude (cost control).
                       None = classify all unique comments.
        output_dir: Directory for JSON output files

    Returns:
        dict with all pipeline results and stats
    """
    start_time = time.time()
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    results = {
        "docket_id": docket_id,
        "pipeline_version": "2.0",
    }

    # ---- STEP 1: Ingest ----
    print("\n" + "=" * 70)
    print("STEP 1/6: DATA INGESTION")
    print("=" * 70)
    ingest_stats = await ingest_docket(docket_id, max_comments=max_comments)
    results["ingestion"] = ingest_stats

    # ---- STEP 2: Generate embeddings ----
    print("\n" + "=" * 70)
    print("STEP 2/6: EMBEDDING GENERATION")
    print("=" * 70)

    # Fetch non-stub, non-empty comments from Neo4j
    comments = run_query("""
        MATCH (c:Comment)
        WHERE c.body_normalized IS NOT NULL AND c.body_normalized <> ''
          AND (c.is_duplicate IS NULL OR c.is_duplicate = false)
          AND (c.is_stub IS NULL OR c.is_stub = false)
          AND (c.word_count IS NULL OR c.word_count >= 8)
        RETURN c.comment_id AS comment_id, c.body_normalized AS text
        ORDER BY c.comment_id
    """)

    if not comments:
        print("[pipeline] No comments found in Neo4j. Aborting.")
        return results

    comment_ids = [c["comment_id"] for c in comments]
    texts = [c["text"] for c in comments]

    embeddings = generate_embeddings(texts)
    print(f"[pipeline] Generated {embeddings.shape[0]} embeddings ({embeddings.shape[1]}-dim)")
    results["embedding_count"] = embeddings.shape[0]

    # ---- STEP 3: Deduplication + Campaign Detection ----
    print("\n" + "=" * 70)
    print("STEP 3/6: DUPLICATE & CAMPAIGN DETECTION")
    print("=" * 70)
    dedup_results = run_dedup_pipeline(comment_ids, embeddings)
    results["dedup"] = dedup_results["summary"]

    # Collect campaign member IDs
    campaign_comment_ids = set()
    for campaign in dedup_results["campaigns"]:
        campaign_comment_ids.update(campaign["member_ids"])

    # Save dedup results
    with open(out / "dedup_results.json", "w") as f:
        json.dump({
            "exact_duplicates": dedup_results["exact_duplicates"],
            "campaigns": [{k: v for k, v in c.items() if k != "member_ids"}
                         for c in dedup_results["campaigns"]],
            "summary": dedup_results["summary"],
        }, f, indent=2, default=str)

    # ---- STEP 4: Thematic Clustering ----
    print("\n" + "=" * 70)
    print("STEP 4/6: THEMATIC CLUSTERING")
    print("=" * 70)

    # Re-fetch non-duplicate, non-stub comments for clustering
    unique_comments = run_query("""
        MATCH (c:Comment)
        WHERE c.body_normalized IS NOT NULL AND c.body_normalized <> ''
          AND (c.is_duplicate IS NULL OR c.is_duplicate = false)
          AND (c.is_stub IS NULL OR c.is_stub = false)
          AND (c.word_count IS NULL OR c.word_count >= 8)
        RETURN c.comment_id AS comment_id, c.body_normalized AS text
        ORDER BY c.comment_id
    """)
    unique_ids = [c["comment_id"] for c in unique_comments]
    unique_texts = [c["text"] for c in unique_comments]

    # Regenerate embeddings for unique-only set if dedup removed any
    if len(unique_ids) < len(comment_ids):
        unique_embeddings = generate_embeddings(unique_texts)
    else:
        unique_embeddings = embeddings

    cluster_results = run_clustering(unique_ids, unique_texts, unique_embeddings)
    results["clustering"] = cluster_results["distribution_summary"]
    results["themes"] = [{k: v for k, v in t.items()} for t in cluster_results["themes"]]

    # Save clustering results
    with open(out / "clustering_results.json", "w") as f:
        json.dump({
            "themes": cluster_results["themes"],
            "novel_arguments": cluster_results["novel_arguments"],
            "distribution": cluster_results["distribution_summary"],
        }, f, indent=2, default=str)

    # Get max cluster size and median inter-cluster distance for CIS
    max_cluster_size = max((t["comment_count"] for t in cluster_results["themes"]), default=1)
    median_icd = cluster_results.get("median_inter_cluster_distance", 0.5)

    # ---- STEP 5: Substantiveness Classification (Claude) ----
    print("\n" + "=" * 70)
    print("STEP 5/6: SUBSTANTIVENESS CLASSIFICATION (CLAUDE)")
    print("=" * 70)

    # Get rule title for context
    rule_title_result = run_query("""
        MATCH (d:Docket {docket_id: $did})
        RETURN d.title AS title
    """, dict(did=docket_id))
    rule_title = rule_title_result[0]["title"] if rule_title_result else docket_id

    # Prepare comments for classification — skip stubs and short comments
    comments_for_classify = run_query("""
        MATCH (c:Comment)
        WHERE c.body IS NOT NULL AND c.body <> ''
          AND (c.is_duplicate IS NULL OR c.is_duplicate = false)
          AND (c.is_stub IS NULL OR c.is_stub = false)
          AND (c.word_count IS NULL OR c.word_count >= 8)
          AND c.primary_label IS NULL
        RETURN c.comment_id AS comment_id, c.body AS body
        ORDER BY c.word_count DESC
    """)

    if classify_limit and classify_limit > 0:
        comments_for_classify = comments_for_classify[:classify_limit]

    print(f"[pipeline] Classifying {len(comments_for_classify)} comments with GPT-4o (8 parallel)...")
    from analysis.classifier import classify_batch_async
    classifications = await classify_batch_async(
        comments_for_classify,
        rule_title=rule_title,
        concurrency=8,
    )

    # Save classifications
    with open(out / "classifications.json", "w") as f:
        json.dump(classifications, f, indent=2, default=str)

    results["classifications_count"] = len(classifications)

    # ---- STEP 6: Comment Impact Scoring ----
    print("\n" + "=" * 70)
    print("STEP 6/6: COMMENT IMPACT SCORING (CIS)")
    print("=" * 70)

    # Fetch all classified comments for scoring
    scored_comments = run_query("""
        MATCH (c:Comment)
        WHERE c.primary_label IS NOT NULL
        RETURN c.comment_id AS comment_id
    """)

    cis_results = score_batch(
        scored_comments,
        classifications,
        max_cluster_size=max_cluster_size,
        median_inter_cluster_dist=median_icd,
        campaign_comment_ids=campaign_comment_ids,
    )

    # Save CIS results
    with open(out / "cis_results.json", "w") as f:
        json.dump(cis_results, f, indent=2, default=str)

    results["scoring_count"] = len(cis_results)

    # ---- STEP 7: Executive Summary (OpenAI) ----
    print("\n" + "=" * 70)
    print("STEP 7/7: EXECUTIVE SUMMARY (OPENAI)")
    print("=" * 70)
    try:
        from analysis.summarizer import generate_executive_summary
        summary = generate_executive_summary(docket_id)
        if summary:
            results["executive_summary"] = summary
            print(f"[pipeline] Executive summary: {len(summary)} chars")
        else:
            print("[pipeline] Skipped — no OpenAI API key configured")
    except Exception as e:
        print(f"[pipeline] Summary generation failed: {e}")

    # ---- DONE ----
    elapsed = time.time() - start_time
    results["elapsed_seconds"] = round(elapsed, 1)

    print("\n" + "=" * 70)
    print(f"PIPELINE COMPLETE — {elapsed:.1f}s")
    print("=" * 70)
    print(f"  Comments ingested: {ingest_stats.get('comments_loaded', 0)}")
    print(f"  Exact duplicate groups: {dedup_results['summary']['exact_duplicate_groups']}")
    print(f"  Campaigns detected: {dedup_results['summary']['campaign_count']}")
    print(f"  Themes discovered: {cluster_results['distribution_summary']['total_themes']}")
    print(f"  Novel arguments: {cluster_results['distribution_summary']['novel_arguments_flagged']}")
    print(f"  Comments classified: {len(classifications)}")
    print(f"  Comments scored: {len(cis_results)}")
    print(f"  Output saved to: {out.absolute()}")

    # Save master results
    with open(out / "pipeline_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    return results


# CLI entrypoint
if __name__ == "__main__":
    import sys

    docket = sys.argv[1] if len(sys.argv) > 1 else "EPA-HQ-OAR-2021-0208"
    max_c = int(sys.argv[2]) if len(sys.argv) > 2 else 500
    classify_n = int(sys.argv[3]) if len(sys.argv) > 3 else 50

    asyncio.run(run_full_pipeline(docket, max_comments=max_c, classify_limit=classify_n))
