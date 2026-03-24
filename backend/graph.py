"""Neo4j graph database layer — schema setup, connection, and CRUD helpers."""

from neo4j import GraphDatabase
from config import get_settings

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        s = get_settings()
        _driver = GraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))
    return _driver


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


def run_query(query: str, params: dict | None = None):
    """Execute a Cypher query and return list of records as dicts."""
    with get_driver().session() as session:
        result = session.run(query, params or {})
        return [record.data() for record in result]


def run_write(query: str, params: dict | None = None):
    """Execute a write Cypher query inside a transaction."""
    with get_driver().session() as session:
        session.execute_write(lambda tx: tx.run(query, params or {}))


# ---------------------------------------------------------------------------
# Schema: constraints + indexes (idempotent — safe to run on every startup)
# ---------------------------------------------------------------------------

SCHEMA_QUERIES = [
    # Uniqueness constraints (also create indexes)
    "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Docket) REQUIRE d.docket_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (doc:Document) REQUIRE doc.document_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Comment) REQUIRE c.comment_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (cm:Commenter) REQUIRE cm.commenter_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Theme) REQUIRE t.theme_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (st:SubTheme) REQUIRE st.sub_theme_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (ca:Campaign) REQUIRE ca.campaign_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (lc:LegalCitation) REQUIRE lc.citation_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (ec:EconomicClaim) REQUIRE ec.claim_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (rp:RegulatoryProvision) REQUIRE rp.provision_id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Agency) REQUIRE a.agency_id IS UNIQUE",

    # Extra indexes for frequent lookups
    "CREATE INDEX IF NOT EXISTS FOR (c:Comment) ON (c.body_hash)",
    "CREATE INDEX IF NOT EXISTS FOR (c:Comment) ON (c.impact_tier)",
    "CREATE INDEX IF NOT EXISTS FOR (c:Comment) ON (c.needs_human_review)",
    "CREATE INDEX IF NOT EXISTS FOR (t:Theme) ON (t.frequency_tier)",
]


def init_schema():
    """Create all constraints and indexes. Safe to call repeatedly."""
    for q in SCHEMA_QUERIES:
        run_write(q)
    print("[graph] Schema initialized — constraints and indexes ready.")


# ---------------------------------------------------------------------------
# Node upsert helpers
# ---------------------------------------------------------------------------

def upsert_agency(agency_id: str, name: str, short_name: str = "",
                  parent_agency_id: str | None = None, url: str = ""):
    run_write("""
        MERGE (a:Agency {agency_id: $agency_id})
        SET a.name = $name, a.short_name = $short_name, a.url = $url
    """, dict(agency_id=agency_id, name=name, short_name=short_name, url=url))
    if parent_agency_id:
        run_write("""
            MATCH (child:Agency {agency_id: $child_id})
            MATCH (parent:Agency {agency_id: $parent_id})
            MERGE (child)-[:CHILD_AGENCY_OF]->(parent)
        """, dict(child_id=agency_id, parent_id=parent_agency_id))


def upsert_docket(docket_id: str, title: str, agency_id: str, **props):
    run_write("""
        MERGE (d:Docket {docket_id: $docket_id})
        SET d.title = $title, d += $props
    """, dict(docket_id=docket_id, title=title, props=props))
    run_write("""
        MATCH (d:Docket {docket_id: $docket_id})
        MATCH (a:Agency {agency_id: $agency_id})
        MERGE (d)-[:ISSUED_BY]->(a)
    """, dict(docket_id=docket_id, agency_id=agency_id))


def upsert_document(document_id: str, docket_id: str, **props):
    run_write("""
        MERGE (doc:Document {document_id: $document_id})
        SET doc += $props
    """, dict(document_id=document_id, props=props))
    run_write("""
        MATCH (doc:Document {document_id: $document_id})
        MATCH (d:Docket {docket_id: $docket_id})
        MERGE (doc)-[:BELONGS_TO_DOCKET]->(d)
    """, dict(document_id=document_id, docket_id=docket_id))


def upsert_comment(comment_id: str, document_id: str, **props):
    run_write("""
        MERGE (c:Comment {comment_id: $comment_id})
        SET c += $props
    """, dict(comment_id=comment_id, props=props))
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (doc:Document {document_id: $document_id})
        MERGE (c)-[:COMMENT_ON]->(doc)
    """, dict(comment_id=comment_id, document_id=document_id))


def upsert_commenter(commenter_id: str, comment_id: str, **props):
    run_write("""
        MERGE (cm:Commenter {commenter_id: $commenter_id})
        SET cm += $props
    """, dict(commenter_id=commenter_id, props=props))
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (cm:Commenter {commenter_id: $commenter_id})
        MERGE (c)-[:SUBMITTED_BY]->(cm)
    """, dict(comment_id=comment_id, commenter_id=commenter_id))


def upsert_theme(theme_id: str, **props):
    run_write("""
        MERGE (t:Theme {theme_id: $theme_id})
        SET t += $props
    """, dict(theme_id=theme_id, props=props))


def link_comment_theme(comment_id: str, theme_id: str,
                       membership_probability: float = 1.0,
                       distance_to_centroid: float = 0.0):
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (t:Theme {theme_id: $theme_id})
        MERGE (c)-[r:HAS_THEME]->(t)
        SET r.membership_probability = $prob, r.distance_to_centroid = $dist
    """, dict(comment_id=comment_id, theme_id=theme_id,
              prob=membership_probability, dist=distance_to_centroid))


def upsert_campaign(campaign_id: str, **props):
    run_write("""
        MERGE (ca:Campaign {campaign_id: $campaign_id})
        SET ca += $props
    """, dict(campaign_id=campaign_id, props=props))


def link_comment_campaign(comment_id: str, campaign_id: str,
                          similarity_to_template: float = 1.0):
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (ca:Campaign {campaign_id: $campaign_id})
        MERGE (c)-[r:MEMBER_OF_CAMPAIGN]->(ca)
        SET r.similarity_to_template = $sim
    """, dict(comment_id=comment_id, campaign_id=campaign_id,
              sim=similarity_to_template))


def link_duplicate(comment_id_a: str, comment_id_b: str,
                   duplicate_type: str = "exact", similarity: float = 1.0):
    run_write("""
        MATCH (a:Comment {comment_id: $a})
        MATCH (b:Comment {comment_id: $b})
        MERGE (a)-[r:DUPLICATE_OF]->(b)
        SET r.duplicate_type = $dtype, r.similarity = $sim
    """, dict(a=comment_id_a, b=comment_id_b, dtype=duplicate_type, sim=similarity))


def upsert_legal_citation(citation_id: str, comment_id: str, **props):
    run_write("""
        MERGE (lc:LegalCitation {citation_id: $citation_id})
        SET lc += $props
    """, dict(citation_id=citation_id, props=props))
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (lc:LegalCitation {citation_id: $citation_id})
        MERGE (c)-[:CITES_LEGAL]->(lc)
    """, dict(comment_id=comment_id, citation_id=citation_id))


def upsert_economic_claim(claim_id: str, comment_id: str, **props):
    run_write("""
        MERGE (ec:EconomicClaim {claim_id: $claim_id})
        SET ec += $props
    """, dict(claim_id=claim_id, props=props))
    run_write("""
        MATCH (c:Comment {comment_id: $comment_id})
        MATCH (ec:EconomicClaim {claim_id: $claim_id})
        MERGE (c)-[:MAKES_ECONOMIC_CLAIM]->(ec)
    """, dict(comment_id=comment_id, claim_id=claim_id))


def upsert_regulatory_provision(provision_id: str, docket_id: str, **props):
    run_write("""
        MERGE (rp:RegulatoryProvision {provision_id: $provision_id})
        SET rp += $props
    """, dict(provision_id=provision_id, props=props))
    run_write("""
        MATCH (rp:RegulatoryProvision {provision_id: $provision_id})
        MATCH (d:Docket {docket_id: $docket_id})
        MERGE (rp)-[:PROVISION_UNDER]->(d)
    """, dict(provision_id=provision_id, docket_id=docket_id))
