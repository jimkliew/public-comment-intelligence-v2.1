"""Duplicate detection and campaign clustering.

Pipeline:
1. Exact duplicates via SHA-256 hash grouping
2. Near-duplicates via FAISS cosine similarity
3. Campaign clustering via connected components on near-duplicate graph
"""

import uuid

import numpy as np
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
from tqdm import tqdm

from config import get_settings
from graph import (
    run_query, run_write, link_duplicate,
    upsert_campaign, link_comment_campaign,
)


def find_exact_duplicates() -> list[dict]:
    """Group comments by body_hash in Neo4j. Returns list of duplicate groups."""
    results = run_query("""
        MATCH (c:Comment)
        WHERE c.body_hash IS NOT NULL
        WITH c.body_hash AS hash, collect(c.comment_id) AS ids, count(*) AS cnt
        WHERE cnt > 1
        RETURN hash, ids, cnt
        ORDER BY cnt DESC
    """)

    groups = []
    for row in results:
        comment_ids = row["ids"]
        # Mark all but first as duplicates and create DUPLICATE_OF edges
        representative = comment_ids[0]
        for dup_id in comment_ids[1:]:
            link_duplicate(dup_id, representative, duplicate_type="exact", similarity=1.0)
            run_write("""
                MATCH (c:Comment {comment_id: $cid})
                SET c.is_duplicate = true, c.duplicate_group_id = $hash
            """, dict(cid=dup_id, hash=row["hash"]))

        groups.append({
            "hash": row["hash"],
            "count": row["cnt"],
            "representative_comment_id": representative,
            "comment_ids": comment_ids,
        })

    print(f"[dedup] Found {len(groups)} exact duplicate groups "
          f"({sum(g['count'] - 1 for g in groups)} duplicate comments)")
    return groups


def find_near_duplicates(
    comment_ids: list[str],
    embeddings: np.ndarray,
    threshold: float | None = None,
) -> list[tuple[str, str, float]]:
    """Find near-duplicate pairs using FAISS cosine similarity.

    Args:
        comment_ids: List of comment IDs (parallel to embeddings)
        embeddings: L2-normalized embeddings (N x D)
        threshold: Cosine similarity threshold (default from config)

    Returns:
        List of (comment_id_a, comment_id_b, similarity) tuples
    """
    if threshold is None:
        threshold = get_settings().near_duplicate_threshold

    n, d = embeddings.shape
    print(f"[dedup] Computing cosine similarity for {n} comments ({d}-dim)...")

    # Compute pairwise cosine similarity using sklearn (portable, no FAISS segfaults)
    sim_matrix = sklearn_cosine(embeddings)

    pairs = []
    seen = set()

    for i in range(n):
        for j in range(i + 1, n):
            sim = float(sim_matrix[i][j])
            if sim < threshold:
                continue

            pair_key = (i, j)
            if pair_key in seen:
                continue
            seen.add(pair_key)

            pairs.append((comment_ids[i], comment_ids[j], sim))

    # Write near-duplicate edges to Neo4j
    for cid_a, cid_b, sim in tqdm(pairs, desc="Writing near-duplicate edges"):
        link_duplicate(cid_a, cid_b, duplicate_type="near", similarity=sim)

    print(f"[dedup] Found {len(pairs)} near-duplicate pairs (threshold={threshold})")
    return pairs


def cluster_campaigns(
    near_duplicate_pairs: list[tuple[str, str, float]],
    all_comment_ids: list[str],
    embeddings: np.ndarray,
) -> list[dict]:
    """Cluster near-duplicates into campaigns using connected components.

    Classification:
    - >50 members with >0.85 mean similarity: "Organized Campaign"
    - >10 but <=50: "Coordinated Submission"
    - <=10: "Informal Similarity Group"
    """
    settings = get_settings()

    # Build graph from near-duplicate pairs
    G = nx.Graph()
    for cid_a, cid_b, sim in near_duplicate_pairs:
        G.add_edge(cid_a, cid_b, weight=sim)

    # Find connected components
    components = list(nx.connected_components(G))

    # Build comment_id -> embedding index
    id_to_idx = {cid: i for i, cid in enumerate(all_comment_ids)}

    campaigns = []
    for component in components:
        member_ids = list(component)
        count = len(member_ids)

        if count < 2:
            continue

        # Compute centroid similarity
        member_indices = [id_to_idx[cid] for cid in member_ids if cid in id_to_idx]
        if not member_indices:
            continue
        member_embeddings = embeddings[member_indices]
        centroid = member_embeddings.mean(axis=0)
        centroid = centroid / np.linalg.norm(centroid)  # Re-normalize
        sims = member_embeddings @ centroid
        mean_sim = float(sims.mean())

        # Classify
        if count > settings.campaign_min_organized and mean_sim > settings.campaign_threshold:
            classification = "Organized Campaign"
        elif count > settings.campaign_min_coordinated:
            classification = "Coordinated Submission"
        else:
            classification = "Informal Similarity Group"

        campaign_id = str(uuid.uuid4())[:8]

        # Create campaign in Neo4j
        upsert_campaign(
            campaign_id=campaign_id,
            classification=classification,
            member_count=count,
            centroid_similarity=round(mean_sim, 4),
        )

        # Link members
        for cid in member_ids:
            if cid in id_to_idx:
                idx = id_to_idx[cid]
                sim_to_centroid = float(embeddings[idx] @ centroid)
                link_comment_campaign(cid, campaign_id, similarity_to_template=sim_to_centroid)

        campaigns.append({
            "campaign_id": campaign_id,
            "classification": classification,
            "member_count": count,
            "centroid_similarity": mean_sim,
            "member_ids": member_ids,
        })

    print(f"[dedup] Identified {len(campaigns)} campaigns:")
    for c in campaigns[:10]:
        print(f"  {c['campaign_id']}: {c['classification']} ({c['member_count']} members, "
              f"sim={c['centroid_similarity']:.3f})")

    return campaigns


def run_dedup_pipeline(comment_ids: list[str], embeddings: np.ndarray) -> dict:
    """Run the full deduplication pipeline.

    Returns dict with exact_duplicates, near_duplicate_pairs, campaigns, and summary.
    """
    # Step 1: Exact duplicates (from Neo4j hashes)
    exact_groups = find_exact_duplicates()

    # Step 2: Near-duplicates (from embeddings)
    near_pairs = find_near_duplicates(comment_ids, embeddings)

    # Step 3: Campaign clustering
    campaigns = cluster_campaigns(near_pairs, comment_ids, embeddings)

    # Summary
    exact_dup_count = sum(g["count"] - 1 for g in exact_groups)
    campaign_count = sum(c["member_count"] for c in campaigns)

    summary = {
        "total_comments": len(comment_ids),
        "unique_comments": len(comment_ids) - exact_dup_count,
        "exact_duplicate_count": exact_dup_count,
        "exact_duplicate_groups": len(exact_groups),
        "near_duplicate_pairs": len(near_pairs),
        "campaign_count": len(campaigns),
        "campaign_affiliated_count": campaign_count,
    }

    print("\n[dedup] SUMMARY:")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    return {
        "exact_duplicates": exact_groups,
        "near_duplicate_pairs": near_pairs,
        "campaigns": campaigns,
        "summary": summary,
    }
