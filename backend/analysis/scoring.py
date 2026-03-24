"""Comment Impact Scoring (CIS) — 7-factor transparent scoring methodology.

Formula:
  CIS = 0.20*L + 0.15*E + 0.15*R + 0.10*C + 0.20*N + 0.10*T + 0.10*V

Two computation groups:

  AI Agent Assessment (60%):
    L = Legal Specificity (0.20)  — GPT-4o evaluates citation depth
    E = Economic Evidence (0.15)  — GPT-4o evaluates quantitative quality
    R = Regulatory Engagement (0.15) — GPT-4o evaluates provision engagement
    C = Commenter Credibility (0.10) — GPT-4o infers commenter type from text

  Peer-Based Numerical (40%):
    N = Novelty (0.20)            — HDBSCAN outlier distance (deterministic)
    T = Thematic Centrality (0.10) — Cosine similarity to centroid (deterministic)
    V = Volume Signal (0.10)      — Cluster size ratio (deterministic)
"""

from graph import run_query, run_write

# Weights — grouped by computation type
# AI Agent Assessment: L, E, R, C (sum = 0.60)
# Peer-Based Numerical: N, T, V (sum = 0.40)
WEIGHTS = {
    "L": 0.20,  # Legal Specificity (AI Agent)
    "E": 0.15,  # Economic Evidence (AI Agent)
    "R": 0.15,  # Regulatory Engagement (AI Agent)
    "C": 0.10,  # Commenter Credibility (AI Agent)
    "N": 0.20,  # Novelty (Peer-Based)
    "T": 0.10,  # Thematic Centrality (Peer-Based)
    "V": 0.10,  # Volume Signal (Peer-Based)
}

# Base error margins for confidence intervals
ERROR_MARGINS = {
    "V": 0.02,   # Near-deterministic (count-based)
    "L": 0.25,   # Subjective (classification quality)
    "E": 0.25,   # Subjective (claim detection quality)
    "T": 0.05,   # Embedding-based (stable)
    "N": 0.05,   # Embedding-based (stable)
    "R": 0.25,   # Subjective (provision matching)
    "C": 0.25,   # Subjective (entity resolution)
}

# Legal specificity rubric scores
LEGAL_SCORE_MAP = {
    0: 0.0,    # No legal content
    1: 0.25,   # General legal language without citations
    2: 0.50,   # 1 specific legal citation
    3: 0.75,   # 2+ citations with analytical connection
    4: 1.0,    # Detailed legal brief
}

# Economic evidence rubric scores
ECONOMIC_SCORE_MAP = {
    0: 0.0,    # No economic content
    1: 0.25,   # Qualitative economic concern
    2: 0.50,   # Specific but unsourced estimates
    3: 0.75,   # Sourced estimates with methodology
    4: 1.0,    # Original quantitative analysis
}

# Regulatory engagement rubric scores
REGULATORY_SCORE_MAP = {
    0: 0.0,    # No reference to rule text
    1: 0.25,   # General reference to rule's topic
    2: 0.50,   # References specific sections
    3: 0.75,   # Quotes/paraphrases and critiques
    4: 1.0,    # Provides alternative regulatory language
}

# Commenter credibility signal scores
CREDIBILITY_SCORE_MAP = {
    "anonymous": 0.0,
    "individual": 0.25,
    "organization": 0.50,
    "trade_association": 0.75,
    "academic": 0.75,
    "law_firm": 1.0,
    "government": 1.0,
    "congressional": 1.0,
}


def compute_volume_signal(comment_id: str, max_cluster_size: int,
                          is_campaign: bool = False) -> float:
    """V — Volume Signal: cluster_size / max_cluster_size, campaign-penalized."""
    result = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[:HAS_THEME]->(t:Theme)
        RETURN t.comment_count AS cluster_size
        ORDER BY t.comment_count DESC LIMIT 1
    """, dict(cid=comment_id))

    if not result:
        return 0.0

    cluster_size = result[0].get("cluster_size", 0) or 0
    v = min(1.0, cluster_size / max(1, max_cluster_size))

    # Campaign penalty
    if is_campaign:
        v *= 0.5

    return round(v, 4)


def compute_legal_specificity(classification: dict) -> float:
    """L — Legal Specificity: from classification labels and legal citations."""
    labels = [c["label"] for c in classification.get("classifications", [])]
    citations = classification.get("legal_citations", [])
    n_citations = len(citations)

    if "legal" not in labels:
        if n_citations == 0:
            return 0.0
        return 0.25  # Has citation but not classified as legal

    # Score based on citation count and classification confidence
    legal_conf = 0.0
    for c in classification.get("classifications", []):
        if c["label"] == "legal":
            legal_conf = c.get("confidence", 0.5)
            break

    if n_citations == 0:
        return 0.25
    elif n_citations == 1:
        return 0.50
    elif n_citations >= 2 and legal_conf >= 0.8:
        return 1.0
    elif n_citations >= 2:
        return 0.75
    return 0.50


def compute_economic_evidence(classification: dict) -> float:
    """E — Economic Evidence: from classification and economic claims."""
    labels = [c["label"] for c in classification.get("classifications", [])]
    claims = classification.get("economic_claims", [])

    if "economic" not in labels and not claims:
        return 0.0

    if not claims:
        return 0.25  # Labeled economic but no extracted claims

    has_quantitative = any(c.get("quantitative") for c in claims)
    has_amount = any(c.get("amount") for c in claims)

    if has_quantitative and has_amount:
        return 0.75  # Has specific numbers
    elif has_quantitative:
        return 0.50
    elif claims:
        return 0.25
    return 0.0


def compute_thematic_centrality(comment_id: str) -> float:
    """T — Thematic Centrality: cosine similarity to cluster centroid (stored as distance)."""
    result = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[r:HAS_THEME]->(t:Theme)
        RETURN r.distance_to_centroid AS dist, r.membership_probability AS prob
        ORDER BY r.membership_probability DESC LIMIT 1
    """, dict(cid=comment_id))

    if not result:
        return 0.0

    dist = result[0].get("dist", 0.5) or 0.5
    # Convert distance back to similarity: sim = 1 - dist
    return round(max(0.0, min(1.0, 1.0 - dist)), 4)


def compute_novelty(comment_id: str, median_inter_cluster_dist: float) -> float:
    """N — Novelty: based on HDBSCAN outlier status and cluster size."""
    result = run_query("""
        MATCH (c:Comment {comment_id: $cid})
        OPTIONAL MATCH (c)-[r:HAS_THEME]->(t:Theme)
        RETURN c.novelty_flag AS is_novel,
               c.novelty_distance AS novel_dist,
               t.comment_count AS cluster_size,
               t.theme_id AS theme_id
    """, dict(cid=comment_id))

    if not result:
        return 0.5  # Unknown — moderate novelty

    row = result[0]

    # If flagged as novel outlier
    if row.get("is_novel"):
        dist = row.get("novel_dist", 0.5) or 0.5
        return round(min(1.0, dist / (2 * max(0.01, median_inter_cluster_dist))), 4)

    # If in a cluster, novelty inversely proportional to cluster size
    cluster_size = row.get("cluster_size")
    if cluster_size is None:
        return 0.7  # No theme assigned but not flagged — moderate-high

    # Get total comments for percentage calculation
    total_result = run_query("MATCH (c:Comment) RETURN count(c) AS total")
    total = total_result[0]["total"] if total_result else 1000
    pct = cluster_size / max(1, total)

    if pct < 0.01:
        return 0.7   # Small cluster (<1%)
    elif pct < 0.05:
        return 0.4   # Medium cluster (1-5%)
    else:
        return 0.1   # Large cluster (>5%)


def compute_regulatory_engagement(classification: dict) -> float:
    """R — Regulatory Engagement: how specifically the comment engages with rule text."""
    provisions = classification.get("provisions_referenced", [])
    cot = classification.get("chain_of_thought", {})
    provision_engagement = cot.get("provision_engagement", "")

    if not provisions and "no" in str(provision_engagement).lower():
        return 0.0

    if not provisions:
        return 0.25  # General reference

    # Check for specific CFR or section references
    has_specific = any(
        any(kw in p.lower() for kw in ["cfr", "section", "§", "part", "subpart"])
        for p in provisions
    )

    if len(provisions) >= 2 and has_specific:
        return 0.75
    elif has_specific:
        return 0.50
    else:
        return 0.25


def compute_credibility(comment_id: str) -> float:
    """C — Commenter Credibility Signals (lowest weight, strong guardrails)."""
    result = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN cm.commenter_type AS ctype
    """, dict(cid=comment_id))

    if not result:
        return 0.0

    ctype = result[0].get("ctype", "anonymous") or "anonymous"
    return CREDIBILITY_SCORE_MAP.get(ctype, 0.0)


def compute_cis(
    comment_id: str,
    classification: dict,
    max_cluster_size: int = 100,
    median_inter_cluster_dist: float = 0.5,
    is_campaign: bool = False,
) -> dict:
    """Compute the full Comment Impact Score for a single comment.

    Returns dict with factor scores, composite CIS, confidence interval, and tier.
    """
    # Compute each factor
    factors = {
        "V": compute_volume_signal(comment_id, max_cluster_size, is_campaign),
        "L": compute_legal_specificity(classification),
        "E": compute_economic_evidence(classification),
        "T": compute_thematic_centrality(comment_id),
        "N": compute_novelty(comment_id, median_inter_cluster_dist),
        "R": compute_regulatory_engagement(classification),
        "C": compute_credibility(comment_id),
    }

    # Weighted sum
    cis_raw = sum(WEIGHTS[k] * factors[k] for k in WEIGHTS)
    cis_display = round(cis_raw * 100)

    # Confidence interval
    primary_conf = classification.get("primary_confidence", 0.5)
    cis_low = 0.0
    cis_high = 0.0
    for k in WEIGHTS:
        margin = ERROR_MARGINS[k] * (1 - primary_conf)
        s_low = max(0.0, factors[k] - margin)
        s_high = min(1.0, factors[k] + margin)
        cis_low += WEIGHTS[k] * s_low
        cis_high += WEIGHTS[k] * s_high

    ci_low = round(cis_low * 100)
    ci_high = round(cis_high * 100)

    # Tier
    if cis_display >= 90:
        tier = "Critical"
    elif cis_display >= 70:
        tier = "High"
    elif cis_display >= 50:
        tier = "Moderate"
    elif cis_display >= 30:
        tier = "Low"
    else:
        tier = "Minimal"

    result = {
        "comment_id": comment_id,
        "factors": factors,
        "weights": WEIGHTS,
        "cis_raw": round(cis_raw, 4),
        "cis_display": cis_display,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "tier": tier,
    }

    return result


def write_cis_to_graph(comment_id: str, cis: dict):
    """Write CIS results to Neo4j Comment node."""
    run_write("""
        MATCH (c:Comment {comment_id: $cid})
        SET c.impact_score = $score,
            c.impact_score_ci_low = $ci_low,
            c.impact_score_ci_high = $ci_high,
            c.impact_tier = $tier,
            c.cis_factors = $factors
    """, dict(
        cid=comment_id,
        score=cis["cis_display"],
        ci_low=cis["ci_low"],
        ci_high=cis["ci_high"],
        tier=cis["tier"],
        factors=str(cis["factors"]),  # Neo4j stores as string
    ))

    # Flag high-CIS comments for human review
    if cis["cis_display"] >= 70:
        run_write("""
            MATCH (c:Comment {comment_id: $cid})
            SET c.needs_human_review = true,
                c.review_reason = coalesce(c.review_reason, '') +
                    CASE WHEN c.review_reason IS NOT NULL AND c.review_reason <> ''
                    THEN '; high_impact_score' ELSE 'high_impact_score' END
        """, dict(cid=comment_id))

    # Flag inconsistencies (non_substantive with high score)
    if cis["cis_display"] >= 50:
        check = run_query("""
            MATCH (c:Comment {comment_id: $cid})
            WHERE c.primary_label = 'non_substantive'
            RETURN c.comment_id AS cid
        """, dict(cid=comment_id))
        if check:
            run_write("""
                MATCH (c:Comment {comment_id: $cid})
                SET c.needs_human_review = true,
                    c.review_reason = coalesce(c.review_reason, '') +
                        CASE WHEN c.review_reason IS NOT NULL AND c.review_reason <> ''
                        THEN '; label_score_inconsistency' ELSE 'label_score_inconsistency' END
            """, dict(cid=comment_id))


def score_batch(
    comments: list[dict],
    classifications: list[dict],
    max_cluster_size: int = 100,
    median_inter_cluster_dist: float = 0.5,
    campaign_comment_ids: set | None = None,
) -> list[dict]:
    """Score a batch of comments.

    Args:
        comments: List of comment dicts with 'comment_id'
        classifications: List of classification results (parallel)
        max_cluster_size: Largest theme cluster size
        median_inter_cluster_dist: From clustering output
        campaign_comment_ids: Set of comment IDs that are campaign members

    Returns:
        List of CIS result dicts
    """
    if campaign_comment_ids is None:
        campaign_comment_ids = set()

    # Build classification lookup
    class_map = {c["comment_id"]: c for c in classifications}

    results = []
    for comment in comments:
        cid = comment["comment_id"]
        classification = class_map.get(cid, {
            "classifications": [],
            "primary_label": "non_substantive",
            "primary_confidence": 0.3,
        })

        is_campaign = cid in campaign_comment_ids

        cis = compute_cis(
            cid, classification,
            max_cluster_size=max_cluster_size,
            median_inter_cluster_dist=median_inter_cluster_dist,
            is_campaign=is_campaign,
        )

        write_cis_to_graph(cid, cis)
        results.append(cis)

        print(f"[scoring] {cid}: CIS={cis['cis_display']} ({cis['tier']}) "
              f"CI=[{cis['ci_low']}, {cis['ci_high']}]")

    return results
