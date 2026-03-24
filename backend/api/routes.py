"""API routes — Cypher queries powering the executive dashboard."""

from fastapi import APIRouter, Query
from graph import run_query

router = APIRouter()


# ---------------------------------------------------------------------------
# Docket overview
# ---------------------------------------------------------------------------

@router.get("/dockets")
def list_dockets():
    """List all ingested dockets with summary stats."""
    return run_query("""
        MATCH (d:Docket)
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WITH d, count(DISTINCT doc) AS doc_count, count(DISTINCT c) AS comment_count
        OPTIONAL MATCH (d)<-[:ISSUED_BY]-(a:Agency)
        RETURN d.docket_id AS docket_id,
               d.title AS title,
               a.short_name AS agency,
               doc_count,
               comment_count
        ORDER BY comment_count DESC
    """)


@router.get("/dockets/{docket_id}")
def get_docket(docket_id: str):
    """Get docket detail with full stats."""
    overview = run_query("""
        MATCH (d:Docket {docket_id: $did})
        OPTIONAL MATCH (d)<-[:ISSUED_BY]-(a:Agency)
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WITH d, a, count(DISTINCT c) AS total_comments
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c2:Comment)
        WHERE c2.is_duplicate = true
        WITH d, a, total_comments, count(DISTINCT c2) AS duplicate_count
        RETURN d.docket_id AS docket_id,
               d.title AS title,
               d.abstract AS abstract,
               d.rin AS rin,
               d.executive_summary AS executive_summary,
               a.name AS agency_name,
               a.short_name AS agency_short,
               total_comments,
               duplicate_count,
               total_comments - duplicate_count AS unique_comments
    """, dict(did=docket_id))
    return overview[0] if overview else {"error": "Docket not found"}


@router.get("/dockets/{docket_id}/stakeholder-theme-flow")
def get_stakeholder_theme_flow(docket_id: str):
    """Stakeholder type × AI Category cross-tabulation for Sankey diagram."""
    flows = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        WHERE c.ai_category IS NOT NULL AND cm.commenter_type IS NOT NULL
        RETURN cm.commenter_type AS source,
               c.ai_category AS target,
               count(c) AS value
        ORDER BY value DESC
    """, dict(did=docket_id))
    return flows


@router.get("/dockets/{docket_id}/themes-with-stance")
def get_themes_with_stance(docket_id: str):
    """Themes with per-theme stance breakdown."""
    themes = run_query("""
        MATCH (c:Comment)-[:HAS_THEME]->(t:Theme)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH t, count(c) AS comment_count
        OPTIONAL MATCH (c2:Comment)-[:HAS_THEME]->(t)
        WHERE c2.stance IS NOT NULL
        WITH t, comment_count,
             count(CASE WHEN c2.stance = 'support' THEN 1 END) AS support,
             count(CASE WHEN c2.stance = 'oppose' THEN 1 END) AS oppose,
             count(CASE WHEN c2.stance = 'conditional' THEN 1 END) AS conditional,
             count(CASE WHEN c2.stance = 'neutral' THEN 1 END) AS neutral
        RETURN t.theme_id AS theme_id,
               t.label AS label,
               t.keywords AS keywords,
               t.frequency_tier AS frequency_tier,
               comment_count,
               support, oppose, conditional, neutral
        ORDER BY comment_count DESC
    """, dict(did=docket_id))
    return themes


@router.get("/dockets/{docket_id}/ai-categories")
def get_ai_categories(docket_id: str):
    """Get AI categories with per-category stats (count, avg support, avg credibility)."""
    import json as _json

    docket = run_query("MATCH (d:Docket {docket_id: $did}) RETURN d.ai_categories AS cats", dict(did=docket_id))
    categories = []
    if docket and docket[0].get("cats"):
        try:
            categories = _json.loads(docket[0]["cats"])
        except Exception:
            pass

    stats = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.ai_category IS NOT NULL
        RETURN c.ai_category AS category,
               count(c) AS count,
               avg(c.ai_support) AS avg_support,
               avg(c.ai_credibility) AS avg_credibility,
               min(c.ai_support) AS min_support,
               max(c.ai_support) AS max_support
        ORDER BY count DESC
    """, dict(did=docket_id))

    stat_map = {r["category"]: r for r in stats}

    result = []
    for cat in categories:
        s = stat_map.get(cat["name"], {})
        result.append({
            **cat,
            "count": s.get("count", 0),
            "avg_support": round(s.get("avg_support") or 0, 1),
            "avg_credibility": round(s.get("avg_credibility") or 0, 1),
            "min_support": s.get("min_support", 0),
            "max_support": s.get("max_support", 0),
        })

    return result


@router.get("/dockets/{docket_id}/category-arguments/{category}")
def get_category_arguments(docket_id: str, category: str):
    """Top 3 supporting and top 3 opposing arguments for an AI category."""
    supporting = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.ai_category = $cat AND c.ai_support >= 7
        RETURN c.comment_id AS id, substring(c.body, 0, 150) AS excerpt,
               c.ai_support AS support, c.impact_score AS cis
        ORDER BY c.ai_support DESC, c.impact_score DESC
        LIMIT 3
    """, dict(did=docket_id, cat=category))

    opposing = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.ai_category = $cat AND c.ai_support <= 4
        RETURN c.comment_id AS id, substring(c.body, 0, 150) AS excerpt,
               c.ai_support AS support, c.impact_score AS cis
        ORDER BY c.ai_support ASC, c.impact_score DESC
        LIMIT 3
    """, dict(did=docket_id, cat=category))

    return {"supporting": supporting, "opposing": opposing}


@router.post("/dockets/{docket_id}/run-ai-categories")
async def run_ai_categories_endpoint(docket_id: str):
    """Run AI categorization on demand."""
    from analysis.ai_categories import run_ai_categorization
    result = await run_ai_categorization(docket_id)
    return result


@router.post("/dockets/{docket_id}/generate-summary")
def generate_summary(docket_id: str):
    """Generate or regenerate executive summary on demand."""
    from analysis.summarizer import generate_executive_summary
    summary = generate_executive_summary(docket_id)
    return {"summary": summary}


@router.get("/dockets/{docket_id}/stats")
def get_docket_stats(docket_id: str):
    """Get comprehensive stats for dashboard cards."""
    stats = {}

    # Total and unique comments
    counts = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        RETURN count(c) AS total,
               count(CASE WHEN c.is_duplicate = true THEN 1 END) AS duplicates,
               count(CASE WHEN c.needs_human_review = true THEN 1 END) AS needs_review
    """, dict(did=docket_id))
    if counts:
        stats.update(counts[0])

    # Substantiveness breakdown
    stats["substantiveness"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.primary_label IS NOT NULL
        RETURN c.primary_label AS label, count(c) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Impact tier breakdown
    stats["impact_tiers"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.impact_tier IS NOT NULL
        RETURN c.impact_tier AS tier, count(c) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Campaign count
    campaigns = run_query("""
        MATCH (c:Comment)-[:MEMBER_OF_CAMPAIGN]->(ca:Campaign)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN count(DISTINCT ca) AS campaign_count,
               count(DISTINCT c) AS campaign_comments
    """, dict(did=docket_id))
    if campaigns:
        stats.update(campaigns[0])

    # Theme count
    theme_count = run_query("""
        MATCH (c:Comment)-[:HAS_THEME]->(t:Theme)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN count(DISTINCT t) AS theme_count
    """, dict(did=docket_id))
    if theme_count:
        stats.update(theme_count[0])

    # Stance breakdown (from stance property, or inferred from chain_of_thought)
    stats["stance"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WHERE c.stance IS NOT NULL
        RETURN c.stance AS stance, count(c) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Stance by commenter type
    stats["stance_by_type"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        WHERE c.stance IS NOT NULL
        RETURN cm.commenter_type AS commenter_type,
               c.stance AS stance,
               count(c) AS count
        ORDER BY cm.commenter_type, count DESC
    """, dict(did=docket_id))

    # Commenter type breakdown
    stats["commenter_types"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN cm.commenter_type AS type, count(DISTINCT cm) AS count
        ORDER BY count DESC
    """, dict(did=docket_id))

    # Stub vs body stats
    stats["content_quality"] = run_query("""
        MATCH (d:Docket {docket_id: $did})<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        RETURN count(c) AS total,
               count(CASE WHEN c.is_stub = true THEN 1 END) AS stubs,
               count(CASE WHEN c.is_stub IS NULL OR c.is_stub = false THEN 1 END) AS with_body,
               count(CASE WHEN c.primary_label IS NOT NULL THEN 1 END) AS classified
    """, dict(did=docket_id))

    return stats


# ---------------------------------------------------------------------------
# Themes
# ---------------------------------------------------------------------------

@router.get("/dockets/{docket_id}/themes")
def get_themes(docket_id: str):
    """Get all themes for a docket with comment counts."""
    return run_query("""
        MATCH (c:Comment)-[r:HAS_THEME]->(t:Theme)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH t, count(DISTINCT c) AS comment_count,
             collect(DISTINCT c.primary_label) AS labels
        RETURN t.theme_id AS theme_id,
               t.label AS label,
               t.keywords AS keywords,
               t.frequency_tier AS frequency_tier,
               comment_count,
               labels AS substantiveness_labels
        ORDER BY comment_count DESC
    """, dict(did=docket_id))


@router.get("/themes/{theme_id}/comments")
def get_theme_comments(theme_id: str, limit: int = Query(default=50)):
    """Get comments in a theme, sorted by impact score."""
    return run_query("""
        MATCH (c:Comment)-[r:HAS_THEME]->(t:Theme {theme_id: $tid})
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN c.comment_id AS comment_id,
               c.body AS body,
               c.primary_label AS label,
               c.primary_confidence AS confidence,
               c.impact_score AS impact_score,
               c.impact_tier AS impact_tier,
               cm.name AS commenter_name,
               cm.organization AS organization,
               cm.commenter_type AS commenter_type,
               r.membership_probability AS theme_probability
        ORDER BY c.impact_score DESC
        LIMIT $limit
    """, dict(tid=theme_id, limit=limit))


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.get("/comments")
def list_comments(
    docket_id: str | None = None,
    label: str | None = None,
    tier: str | None = None,
    needs_review: bool | None = None,
    limit: int = Query(default=50),
    offset: int = Query(default=0),
):
    """List comments with filtering."""
    where_clauses = []
    params = {"limit": limit, "offset": offset}

    if docket_id:
        where_clauses.append(
            "(c)-[:COMMENT_ON]->(:Document)-[:BELONGS_TO_DOCKET]->(:Docket {docket_id: $did})")
        params["did"] = docket_id
    if label:
        where_clauses.append("c.primary_label = $label")
        params["label"] = label
    if tier:
        where_clauses.append("c.impact_tier = $tier")
        params["tier"] = tier
    if needs_review is not None:
        where_clauses.append("c.needs_human_review = $review")
        params["review"] = needs_review

    where = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    return run_query(f"""
        MATCH (c:Comment)
        {where}
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN c.comment_id AS comment_id,
               c.title AS title,
               substring(c.body, 0, 200) AS excerpt,
               c.primary_label AS label,
               c.primary_confidence AS confidence,
               c.impact_score AS impact_score,
               c.impact_tier AS impact_tier,
               c.needs_human_review AS needs_review,
               cm.name AS commenter_name,
               cm.organization AS organization
        ORDER BY c.impact_score DESC
        SKIP $offset LIMIT $limit
    """, params)


@router.get("/comments/{comment_id}")
def get_comment_detail(comment_id: str):
    """Full comment detail with all analysis results."""
    # Main comment data
    comment = run_query("""
        MATCH (c:Comment {comment_id: $cid})
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        OPTIONAL MATCH (c)-[:COMMENT_ON]->(doc:Document)
        RETURN c {.*} AS comment,
               cm {.*} AS commenter,
               doc.document_id AS document_id,
               doc.title AS document_title
    """, dict(cid=comment_id))

    if not comment:
        return {"error": "Comment not found"}

    result = comment[0]

    # Themes
    result["themes"] = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[r:HAS_THEME]->(t:Theme)
        RETURN t.theme_id AS theme_id, t.label AS label,
               r.membership_probability AS probability
    """, dict(cid=comment_id))

    # Legal citations
    result["legal_citations"] = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[:CITES_LEGAL]->(lc:LegalCitation)
        RETURN lc.citation_text AS citation, lc.citation_type AS type,
               lc.context_excerpt AS context
    """, dict(cid=comment_id))

    # Economic claims
    result["economic_claims"] = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[:MAKES_ECONOMIC_CLAIM]->(ec:EconomicClaim)
        RETURN ec.claim_text AS claim, ec.claim_type AS type,
               ec.quantitative AS quantitative, ec.amount AS amount
    """, dict(cid=comment_id))

    # Campaign membership
    result["campaign"] = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[r:MEMBER_OF_CAMPAIGN]->(ca:Campaign)
        RETURN ca.campaign_id AS campaign_id, ca.classification AS classification,
               ca.member_count AS member_count, r.similarity_to_template AS similarity
    """, dict(cid=comment_id))

    # Similar comments (near-duplicates)
    result["similar_comments"] = run_query("""
        MATCH (c:Comment {comment_id: $cid})-[r:DUPLICATE_OF]-(other:Comment)
        RETURN other.comment_id AS comment_id,
               r.duplicate_type AS type,
               r.similarity AS similarity,
               substring(other.body, 0, 200) AS excerpt
        LIMIT 10
    """, dict(cid=comment_id))

    return result


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

@router.get("/dockets/{docket_id}/campaigns")
def get_campaigns(docket_id: str):
    """Get all campaigns for a docket."""
    return run_query("""
        MATCH (c:Comment)-[r:MEMBER_OF_CAMPAIGN]->(ca:Campaign)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH ca, count(DISTINCT c) AS actual_count,
             collect(DISTINCT substring(c.body, 0, 300))[0] AS template_excerpt
        RETURN ca.campaign_id AS campaign_id,
               ca.classification AS classification,
               actual_count AS member_count,
               ca.centroid_similarity AS centroid_similarity,
               template_excerpt
        ORDER BY actual_count DESC
    """, dict(did=docket_id))


# ---------------------------------------------------------------------------
# Knowledge graph data (for D3 force graph visualization)
# ---------------------------------------------------------------------------

@router.get("/dockets/{docket_id}/graph")
def get_knowledge_graph(docket_id: str, limit: int = Query(default=200)):
    """Get knowledge graph nodes and edges for D3 force visualization.

    Server-side filters links to only include nodes present in the result,
    preventing 'node not found' errors in D3.
    """
    nodes = []
    links = []

    # Docket node
    docket = run_query("""
        MATCH (d:Docket {docket_id: $did})
        RETURN d.docket_id AS id, d.title AS label, 'docket' AS type
    """, dict(did=docket_id))
    nodes.extend(docket)

    # AI Category nodes (instead of BERTopic themes)
    categories = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.ai_category IS NOT NULL
        WITH c.ai_category AS cat, count(c) AS size
        RETURN cat AS id, cat AS label, 'category' AS type, size
        ORDER BY size DESC
    """, dict(did=docket_id))
    nodes.extend(categories)

    # Top comments by impact score
    top_comments = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.impact_score IS NOT NULL
        RETURN c.comment_id AS id,
               substring(c.body, 0, 80) AS label,
               'comment' AS type,
               c.impact_score AS score,
               c.impact_tier AS tier,
               c.primary_label AS substantiveness
        ORDER BY c.impact_score DESC
        LIMIT $limit
    """, dict(did=docket_id, limit=limit))
    nodes.extend(top_comments)

    # Campaign nodes
    campaigns = run_query("""
        MATCH (c:Comment)-[:MEMBER_OF_CAMPAIGN]->(ca:Campaign)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH ca, count(DISTINCT c) AS size
        RETURN ca.campaign_id AS id,
               ca.classification + ' (' + toString(size) + ')' AS label,
               'campaign' AS type, size
    """, dict(did=docket_id))
    nodes.extend(campaigns)

    # Commenter type aggregation nodes
    commenter_types = run_query("""
        MATCH (c:Comment)-[:SUBMITTED_BY]->(cm:Commenter)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN cm.commenter_type AS id,
               cm.commenter_type AS label,
               'commenter_type' AS type,
               count(DISTINCT cm) AS size
    """, dict(did=docket_id))
    nodes.extend(commenter_types)

    # Build set of all node IDs for server-side link filtering
    node_ids = {n["id"] for n in nodes if n.get("id")}

    # Category → Docket links
    for cat in categories:
        links.append({"source": cat["id"], "target": docket_id, "type": "belongs_to"})

    # Comment → AI Category links
    comment_cat_links = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.ai_category IS NOT NULL AND c.impact_score IS NOT NULL
        RETURN c.comment_id AS source, c.ai_category AS target, 'has_category' AS type
    """, dict(did=docket_id))
    links.extend([lnk for lnk in comment_cat_links if lnk["source"] in node_ids and lnk["target"] in node_ids])

    # Comment → Campaign links
    campaign_links = run_query("""
        MATCH (c:Comment)-[:MEMBER_OF_CAMPAIGN]->(ca:Campaign)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN c.comment_id AS source, ca.campaign_id AS target, 'campaign' AS type
    """, dict(did=docket_id))
    links.extend([lnk for lnk in campaign_links if lnk["source"] in node_ids and lnk["target"] in node_ids])

    # Commenter type → Comment links (aggregate — connect types to their top comment)
    for ct in commenter_types:
        ct_comments = [c for c in top_comments if True]  # All top comments visible
        if ct_comments:
            # Link commenter type to docket for cleaner graph
            links.append({"source": ct["id"], "target": docket_id, "type": "commenter_type"})

    return {"nodes": nodes, "links": links}


# ---------------------------------------------------------------------------
# Human review queue
# ---------------------------------------------------------------------------

@router.get("/dockets/{docket_id}/review-queue")
def get_review_queue(docket_id: str, limit: int = Query(default=50)):
    """Get prioritized human review queue.

    Priority order:
    1. Novel arguments (novelty_flag = true)
    2. Low-confidence classifications
    3. High-CIS comments
    4. Label-score inconsistencies
    """
    return run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.needs_human_review = true
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        WITH c, cm,
             CASE
               WHEN c.novelty_flag = true THEN 1
               WHEN c.primary_confidence < 0.6 THEN 2
               WHEN c.impact_score >= 70 THEN 3
               ELSE 4
             END AS priority
        RETURN c.comment_id AS comment_id,
               substring(c.body, 0, 200) AS excerpt,
               c.primary_label AS label,
               c.primary_confidence AS confidence,
               c.impact_score AS impact_score,
               c.impact_tier AS tier,
               c.review_reason AS review_reason,
               c.novelty_flag AS is_novel,
               cm.name AS commenter_name,
               cm.organization AS organization,
               priority
        ORDER BY priority ASC, c.impact_score DESC
        LIMIT $limit
    """, dict(did=docket_id, limit=limit))


# ---------------------------------------------------------------------------
# Bias audit
# ---------------------------------------------------------------------------

@router.get("/dockets/{docket_id}/bias-audit")
def get_bias_audit(docket_id: str):
    """Compute bias detection metrics for the docket analysis."""
    audit = {}

    # 1. CIS by commenter type
    audit["cis_by_commenter_type"] = run_query("""
        MATCH (c:Comment)-[:SUBMITTED_BY]->(cm:Commenter)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.impact_score IS NOT NULL
        RETURN cm.commenter_type AS commenter_type,
               avg(c.impact_score) AS mean_cis,
               count(c) AS count,
               min(c.impact_score) AS min_cis,
               max(c.impact_score) AS max_cis
        ORDER BY mean_cis DESC
    """, dict(did=docket_id))

    # 2. CIS by substantiveness label
    audit["cis_by_label"] = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.impact_score IS NOT NULL AND c.primary_label IS NOT NULL
        RETURN c.primary_label AS label,
               avg(c.impact_score) AS mean_cis,
               count(c) AS count
        ORDER BY mean_cis DESC
    """, dict(did=docket_id))

    # 3. Overall mean CIS
    overall = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.impact_score IS NOT NULL
        RETURN avg(c.impact_score) AS overall_mean_cis,
               count(c) AS total_scored
    """, dict(did=docket_id))
    if overall:
        audit["overall"] = overall[0]

    # 4. Human review stats
    review_stats = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        RETURN count(c) AS total,
               count(CASE WHEN c.needs_human_review = true THEN 1 END) AS flagged_for_review,
               count(CASE WHEN c.novelty_flag = true THEN 1 END) AS novel_arguments,
               count(CASE WHEN c.primary_confidence < 0.6 THEN 1 END) AS low_confidence
    """, dict(did=docket_id))
    if review_stats:
        audit["review_stats"] = review_stats[0]

    # 5. Confidence distribution
    audit["confidence_distribution"] = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.primary_confidence IS NOT NULL
        WITH CASE
               WHEN c.primary_confidence >= 0.9 THEN 'high (0.9+)'
               WHEN c.primary_confidence >= 0.7 THEN 'medium-high (0.7-0.9)'
               WHEN c.primary_confidence >= 0.5 THEN 'medium (0.5-0.7)'
               ELSE 'low (<0.5)'
             END AS bucket
        RETURN bucket, count(*) AS count
        ORDER BY bucket
    """, dict(did=docket_id))

    return audit


# ---------------------------------------------------------------------------
# CIS factor-level data (for correlation analysis)
# ---------------------------------------------------------------------------

@router.get("/admin/status")
def get_admin_status():
    """System status for admin dashboard."""
    from config import get_settings
    s = get_settings()

    # Counts per docket
    dockets = run_query("""
        MATCH (d:Docket)
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c:Comment)
        WITH d, count(c) AS total_comments
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c2:Comment)
        WHERE c2.is_duplicate = true
        WITH d, total_comments, count(c2) AS dups
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c3:Comment)
        WHERE c3.is_stub = true
        WITH d, total_comments, dups, count(c3) AS stubs
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c4:Comment)
        WHERE c4.primary_label IS NOT NULL
        WITH d, total_comments, dups, stubs, count(c4) AS classified
        OPTIONAL MATCH (d)<-[:BELONGS_TO_DOCKET]-(doc:Document)<-[:COMMENT_ON]-(c5:Comment)
        WHERE c5.impact_score IS NOT NULL
        RETURN d.docket_id AS docket_id,
               d.title AS title,
               total_comments,
               dups AS duplicates,
               stubs,
               total_comments - dups AS after_dedup,
               classified,
               count(c5) AS scored
        ORDER BY total_comments DESC
    """)

    # Global node counts
    nodes = run_query("""
        MATCH (n)
        RETURN labels(n)[0] AS type, count(n) AS count
        ORDER BY count DESC
    """)

    # Edge counts
    edges = run_query("""
        MATCH ()-[r]->()
        RETURN type(r) AS type, count(r) AS count
        ORDER BY count DESC
    """)

    return {
        "dockets": dockets,
        "node_counts": {r["type"]: r["count"] for r in nodes},
        "edge_counts": {r["type"]: r["count"] for r in edges},
        "config": {
            "openai_model": s.openai_model,
            "embedding_model": s.embedding_model,
            "near_duplicate_threshold": s.near_duplicate_threshold,
            "campaign_threshold": s.campaign_threshold,
            "campaign_min_organized": s.campaign_min_organized,
            "campaign_min_coordinated": s.campaign_min_coordinated,
            "neo4j_uri": s.neo4j_uri,
            "openai_key_set": bool(s.openai_api_key),
            "regulations_key_set": bool(s.regulations_gov_api_key),
            "max_attachment_size_mb": 2,
            "max_attachment_text_chars": 3000,
        },
    }


@router.get("/dockets/{docket_id}/topic-map")
def get_topic_map(docket_id: str):
    """Get 2D UMAP coordinates + theme assignments for BERTopic scatter visualization."""
    points = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.umap_x IS NOT NULL AND c.umap_y IS NOT NULL
        OPTIONAL MATCH (c)-[r:HAS_THEME]->(t:Theme)
        RETURN c.comment_id AS id,
               c.umap_x AS x,
               c.umap_y AS y,
               t.theme_id AS theme_id,
               t.label AS theme_label,
               c.impact_score AS cis,
               c.primary_label AS label,
               c.stance AS stance,
               substring(c.body, 0, 120) AS excerpt
        ORDER BY c.comment_id
    """, dict(did=docket_id))

    # Get theme summary for the legend
    themes = run_query("""
        MATCH (c:Comment)-[:HAS_THEME]->(t:Theme)
        MATCH (c)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WITH t, count(c) AS size, avg(c.umap_x) AS cx, avg(c.umap_y) AS cy
        RETURN t.theme_id AS theme_id, t.label AS label, size,
               cx AS center_x, cy AS center_y
        ORDER BY size DESC
    """, dict(did=docket_id))

    return {"points": points, "themes": themes}


@router.get("/dockets/{docket_id}/comment-timeline")
def get_comment_timeline(docket_id: str):
    """Get daily comment counts with campaign flags for timeline chart."""
    # All comments by date
    daily = run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.posted_date IS NOT NULL AND c.posted_date <> ''
        OPTIONAL MATCH (c)-[dup:DUPLICATE_OF]-()
        WITH substring(c.posted_date, 0, 10) AS day, c,
             CASE WHEN dup IS NOT NULL THEN true ELSE false END AS is_near_dupe
        WITH day,
             count(DISTINCT c) AS total,
             count(DISTINCT CASE WHEN c.is_duplicate = true THEN c END) AS exact_dupes,
             count(DISTINCT CASE WHEN is_near_dupe THEN c END) AS near_dupes
        RETURN day AS date, total, exact_dupes, near_dupes
        ORDER BY day
    """, dict(did=docket_id))
    return daily


@router.get("/dockets/{docket_id}/cis-factors")
def get_cis_factors(docket_id: str):
    """Get per-comment CIS factor scores for scatter/correlation analysis."""
    return run_query("""
        MATCH (c:Comment)-[:COMMENT_ON]->(doc:Document)-[:BELONGS_TO_DOCKET]->(d:Docket {docket_id: $did})
        WHERE c.impact_score IS NOT NULL AND c.cis_factors IS NOT NULL
        OPTIONAL MATCH (c)-[:SUBMITTED_BY]->(cm:Commenter)
        RETURN c.comment_id AS comment_id,
               c.impact_score AS cis,
               c.impact_tier AS tier,
               c.primary_label AS label,
               c.primary_confidence AS confidence,
               c.cis_factors AS factors,
               c.word_count AS word_count,
               c.stance AS stance,
               c.ai_category AS ai_category,
               c.ai_support AS ai_support,
               c.ai_credibility AS ai_credibility,
               substring(c.body, 0, 200) AS excerpt,
               cm.commenter_type AS commenter_type
        ORDER BY c.impact_score DESC
    """, dict(did=docket_id))
