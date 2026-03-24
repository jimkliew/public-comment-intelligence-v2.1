"""Thematic clustering using BERTopic (UMAP + HDBSCAN + c-TF-IDF).

Produces Theme and SubTheme nodes in Neo4j, HAS_THEME edges,
and identifies novel/outlier arguments.
"""

import numpy as np
from bertopic import BERTopic
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer

from graph import upsert_theme, link_comment_theme, run_write


def build_topic_model(n_comments: int) -> BERTopic:
    """Construct a BERTopic model tuned for public comment analysis."""
    # UMAP: reduce to 5 dims, cosine metric for text
    umap_model = UMAP(
        n_neighbors=15,
        n_components=5,
        min_dist=0.0,
        metric="cosine",
        random_state=42,
    )

    # HDBSCAN: adaptive min_cluster_size
    min_cluster = max(10, int(n_comments * 0.005))
    hdbscan_model = HDBSCAN(
        min_cluster_size=min_cluster,
        min_samples=5,
        metric="euclidean",
        cluster_selection_method="eom",
        prediction_data=True,
    )

    # Vectorizer for c-TF-IDF keyword extraction
    vectorizer = CountVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
    )

    model = BERTopic(
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer,
        nr_topics=5,  # Limit to 5 themes max
        top_n_words=10,
        verbose=True,
        calculate_probabilities=True,
    )

    return model


def run_clustering(
    comment_ids: list[str],
    texts: list[str],
    embeddings: np.ndarray,
) -> dict:
    """Run BERTopic clustering and write results to Neo4j.

    Returns:
        dict with themes, novel_arguments, and distribution_summary
    """
    n = len(texts)
    print(f"[clustering] Running BERTopic on {n} comments...")

    model = build_topic_model(n)

    # Fit — pass precomputed embeddings
    topics, probs = model.fit_transform(texts, embeddings=embeddings)

    # ── Compute 2D UMAP projection for visualization ──
    print("[clustering] Computing 2D UMAP projection for visualization...")
    from umap import UMAP as UMAP2D
    umap_2d = UMAP2D(n_neighbors=15, n_components=2, min_dist=0.3,
                      metric="cosine", random_state=42)
    coords_2d = umap_2d.fit_transform(embeddings)

    # Write 2D coords to Neo4j for each comment
    for i, cid in enumerate(comment_ids):
        run_write("""
            MATCH (c:Comment {comment_id: $cid})
            SET c.umap_x = $x, c.umap_y = $y
        """, dict(cid=cid, x=float(coords_2d[i][0]), y=float(coords_2d[i][1])))
    print(f"[clustering] Saved 2D coordinates for {n} comments")

    # Get topic info
    topic_info = model.get_topic_info()
    model.get_topic_freq()

    # Compute centroids for each topic
    unique_topics = set(topics)
    unique_topics.discard(-1)  # Exclude noise
    centroids = {}
    for t in unique_topics:
        mask = np.array(topics) == t
        cluster_embeddings = embeddings[mask]
        centroid = cluster_embeddings.mean(axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        centroids[t] = centroid

    # Determine frequency tiers
    if unique_topics:
        counts = {t: int((np.array(topics) == t).sum()) for t in unique_topics}
        sorted_counts = sorted(counts.values(), reverse=True)
        n_topics = len(sorted_counts)
        high_threshold = sorted_counts[max(0, int(n_topics * 0.2) - 1)] if n_topics > 0 else 0
        low_threshold = sorted_counts[min(n_topics - 1, int(n_topics * 0.8))] if n_topics > 0 else 0
    else:
        counts = {}
        high_threshold = 0
        low_threshold = 0

    # Write themes to Neo4j
    themes = []
    for topic_id in unique_topics:
        theme_id = f"theme-{topic_id}"
        topic_words = model.get_topic(topic_id)
        keywords = [w for w, _ in topic_words[:5]] if topic_words else []
        count = counts.get(topic_id, 0)

        # Frequency tier
        if count >= high_threshold:
            tier = "High"
        elif count <= low_threshold:
            tier = "Low"
        else:
            tier = "Medium"

        # Label from topic info
        info_row = topic_info[topic_info["Topic"] == topic_id]
        label = info_row["Name"].values[0] if len(info_row) > 0 else f"Topic {topic_id}"
        # Clean up BERTopic default labels like "0_word1_word2_word3"
        if label.startswith(f"{topic_id}_"):
            label = " / ".join(keywords[:3]).title()

        upsert_theme(
            theme_id=theme_id,
            label=label,
            keywords=keywords,
            comment_count=count,
            frequency_tier=tier,
        )

        # Find representative comments (closest to centroid)
        mask = np.array(topics) == topic_id
        topic_indices = np.where(mask)[0]
        topic_embeddings = embeddings[topic_indices]
        centroid = centroids[topic_id]
        sims = topic_embeddings @ centroid
        top_indices = np.argsort(sims)[-3:][::-1]  # Top 3
        representative_ids = [comment_ids[topic_indices[i]] for i in top_indices]

        themes.append({
            "theme_id": theme_id,
            "topic_id": topic_id,
            "label": label,
            "keywords": keywords,
            "comment_count": count,
            "frequency_tier": tier,
            "representative_comment_ids": representative_ids,
        })

    # Link comments to themes
    print(f"[clustering] Linking {n} comments to {len(themes)} themes...")
    for i, (cid, topic_id) in enumerate(zip(comment_ids, topics)):
        if topic_id == -1:
            continue  # Outliers handled below

        theme_id = f"theme-{topic_id}"
        # Compute distance to centroid
        centroid = centroids.get(topic_id)
        if centroid is not None:
            dist = float(1.0 - embeddings[i] @ centroid)
            prob = float(probs[i].max()) if probs is not None and len(probs) > i else 1.0
        else:
            dist = 0.0
            prob = 1.0

        link_comment_theme(cid, theme_id,
                           membership_probability=prob,
                           distance_to_centroid=dist)

    # Identify novel arguments (outliers)
    noise_mask = np.array(topics) == -1
    noise_indices = np.where(noise_mask)[0]
    print(f"[clustering] {len(noise_indices)} outlier comments (potential novel arguments)")

    # Compute median inter-cluster distance for novelty threshold
    if len(centroids) > 1:
        centroid_list = list(centroids.values())
        centroid_matrix = np.array(centroid_list)
        inter_dists = []
        for i in range(len(centroid_list)):
            for j in range(i + 1, len(centroid_list)):
                inter_dists.append(1.0 - float(centroid_matrix[i] @ centroid_matrix[j]))
        median_inter_dist = float(np.median(inter_dists)) if inter_dists else 0.5
    else:
        median_inter_dist = 0.5

    novel_arguments = []
    for idx in noise_indices:
        cid = comment_ids[idx]
        emb = embeddings[idx]

        # Find distance to nearest cluster centroid
        if centroids:
            dists = [1.0 - float(emb @ c) for c in centroids.values()]
            min_dist = min(dists)
        else:
            min_dist = 1.0

        is_novel = min_dist > 1.5 * median_inter_dist

        if is_novel:
            novel_arguments.append({
                "comment_id": cid,
                "distance_to_nearest_cluster": round(min_dist, 4),
                "recommended_priority": "High",
            })
            # Flag for human review in Neo4j
            run_write("""
                MATCH (c:Comment {comment_id: $cid})
                SET c.needs_human_review = true,
                    c.novelty_flag = true,
                    c.novelty_distance = $dist
            """, dict(cid=cid, dist=min_dist))

    print(f"[clustering] {len(novel_arguments)} novel arguments flagged for review")

    # Distribution summary
    distribution = {
        "total_themes": len(themes),
        "high_frequency_count": sum(1 for t in themes if t["frequency_tier"] == "High"),
        "medium_frequency_count": sum(1 for t in themes if t["frequency_tier"] == "Medium"),
        "low_frequency_count": sum(1 for t in themes if t["frequency_tier"] == "Low"),
        "noise_comments": len(noise_indices),
        "novel_arguments_flagged": len(novel_arguments),
    }

    print("\n[clustering] DISTRIBUTION:")
    for k, v in distribution.items():
        print(f"  {k}: {v}")

    return {
        "themes": themes,
        "novel_arguments": novel_arguments,
        "distribution_summary": distribution,
        "model": model,  # Keep for potential sub-topic analysis
        "centroids": centroids,
        "topics": topics,
        "median_inter_cluster_distance": median_inter_dist,
    }
