"""Shared fixtures for backend tests."""

import pytest


@pytest.fixture
def legal_classification():
    """A comment classified as a detailed legal brief."""
    return {
        "comment_id": "TEST-001",
        "classifications": [
            {"label": "legal", "confidence": 0.92, "evidence": ["42 USC 300f"], "reasoning": "Cites SDWA"},
        ],
        "primary_label": "legal",
        "primary_confidence": 0.92,
        "legal_citations": [
            {"citation_text": "42 USC 300f", "citation_type": "statute", "context": "Safe Drinking Water Act"},
            {"citation_text": "Whitman v. ATA, 531 U.S. 457", "citation_type": "case_law", "context": "Delegation"},
        ],
        "economic_claims": [],
        "provisions_referenced": ["§ 141.61", "40 CFR Part 141"],
        "chain_of_thought": {
            "legal_analysis": "Comment provides detailed statutory analysis under SDWA.",
            "provision_engagement": "References specific MCL provisions in 40 CFR 141.",
        },
        "stance": "oppose",
        "commenter_type": "law_firm",
    }


@pytest.fixture
def economic_classification():
    """A comment with quantitative economic evidence."""
    return {
        "comment_id": "TEST-002",
        "classifications": [
            {"label": "economic", "confidence": 0.85, "evidence": ["$4.2B cost"], "reasoning": "Original analysis"},
        ],
        "primary_label": "economic",
        "primary_confidence": 0.85,
        "legal_citations": [],
        "economic_claims": [
            {"claim_text": "Implementation will cost $4.2B", "claim_type": "cost", "quantitative": True, "amount": "$4.2B"},
            {"claim_text": "Small systems face 40% rate increases", "claim_type": "impact", "quantitative": True, "amount": "40%"},
        ],
        "provisions_referenced": [],
        "chain_of_thought": {"provision_engagement": "no specific provisions"},
        "stance": "oppose",
        "commenter_type": "trade_association",
    }


@pytest.fixture
def non_substantive_classification():
    """A generic support comment with no specifics."""
    return {
        "comment_id": "TEST-003",
        "classifications": [
            {"label": "non_substantive", "confidence": 0.95, "evidence": [], "reasoning": "General support"},
        ],
        "primary_label": "non_substantive",
        "primary_confidence": 0.95,
        "legal_citations": [],
        "economic_claims": [],
        "provisions_referenced": [],
        "chain_of_thought": {"provision_engagement": "no engagement with rule text"},
        "stance": "support",
        "commenter_type": "individual",
    }


@pytest.fixture
def empty_classification():
    """Fallback classification with no data."""
    return {
        "classifications": [],
        "primary_label": "non_substantive",
        "primary_confidence": 0.3,
        "legal_citations": [],
        "economic_claims": [],
        "provisions_referenced": [],
        "chain_of_thought": {},
    }
