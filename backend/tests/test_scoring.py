"""Tests for CIS scoring formula — the core IP of the platform.

Tests cover:
  - Individual factor computations (L, E, R — pure functions)
  - Weighted CIS composition and tier assignment
  - Confidence interval computation
  - Factor weight invariants
"""

from unittest.mock import patch

from analysis.scoring import (
    WEIGHTS,
    ERROR_MARGINS,
    CREDIBILITY_SCORE_MAP,
    compute_legal_specificity,
    compute_economic_evidence,
    compute_regulatory_engagement,
    compute_volume_signal,
    compute_thematic_centrality,
    compute_novelty,
    compute_credibility,
    compute_cis,
)


# ---------------------------------------------------------------------------
# Weight invariants
# ---------------------------------------------------------------------------

class TestWeightInvariants:
    def test_weights_sum_to_one(self):
        assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9

    def test_ai_agent_group_is_60_percent(self):
        ai_sum = WEIGHTS["L"] + WEIGHTS["E"] + WEIGHTS["R"] + WEIGHTS["C"]
        assert abs(ai_sum - 0.60) < 1e-9

    def test_peer_based_group_is_40_percent(self):
        peer_sum = WEIGHTS["N"] + WEIGHTS["T"] + WEIGHTS["V"]
        assert abs(peer_sum - 0.40) < 1e-9

    def test_all_seven_factors_present(self):
        assert set(WEIGHTS.keys()) == {"L", "E", "R", "C", "N", "T", "V"}

    def test_error_margins_cover_all_factors(self):
        assert set(ERROR_MARGINS.keys()) == set(WEIGHTS.keys())


# ---------------------------------------------------------------------------
# Legal Specificity (L) — pure function
# ---------------------------------------------------------------------------

class TestLegalSpecificity:
    def test_no_legal_content(self, non_substantive_classification):
        assert compute_legal_specificity(non_substantive_classification) == 0.0

    def test_legal_label_no_citations(self):
        c = {"classifications": [{"label": "legal", "confidence": 0.7}], "legal_citations": []}
        assert compute_legal_specificity(c) == 0.25

    def test_one_citation(self):
        c = {
            "classifications": [{"label": "legal", "confidence": 0.7}],
            "legal_citations": [{"citation_text": "42 USC 300f"}],
        }
        assert compute_legal_specificity(c) == 0.50

    def test_two_citations_moderate_confidence(self):
        c = {
            "classifications": [{"label": "legal", "confidence": 0.7}],
            "legal_citations": [{"citation_text": "a"}, {"citation_text": "b"}],
        }
        assert compute_legal_specificity(c) == 0.75

    def test_two_citations_high_confidence(self):
        c = {
            "classifications": [{"label": "legal", "confidence": 0.85}],
            "legal_citations": [{"citation_text": "a"}, {"citation_text": "b"}],
        }
        assert compute_legal_specificity(c) == 1.0

    def test_detailed_brief(self, legal_classification):
        score = compute_legal_specificity(legal_classification)
        assert score == 1.0

    def test_citation_without_legal_label(self):
        c = {
            "classifications": [{"label": "policy", "confidence": 0.8}],
            "legal_citations": [{"citation_text": "42 USC 300f"}],
        }
        assert compute_legal_specificity(c) == 0.25

    def test_empty_classification(self, empty_classification):
        assert compute_legal_specificity(empty_classification) == 0.0


# ---------------------------------------------------------------------------
# Economic Evidence (E) — pure function
# ---------------------------------------------------------------------------

class TestEconomicEvidence:
    def test_no_economic_content(self, non_substantive_classification):
        assert compute_economic_evidence(non_substantive_classification) == 0.0

    def test_labeled_but_no_claims(self):
        c = {"classifications": [{"label": "economic", "confidence": 0.7}], "economic_claims": []}
        assert compute_economic_evidence(c) == 0.25

    def test_qualitative_claims(self):
        c = {
            "classifications": [{"label": "economic", "confidence": 0.7}],
            "economic_claims": [{"claim_text": "costs will rise", "quantitative": False}],
        }
        assert compute_economic_evidence(c) == 0.25

    def test_quantitative_no_amount(self):
        c = {
            "classifications": [{"label": "economic", "confidence": 0.7}],
            "economic_claims": [{"claim_text": "significant cost", "quantitative": True}],
        }
        assert compute_economic_evidence(c) == 0.50

    def test_quantitative_with_amount(self, economic_classification):
        score = compute_economic_evidence(economic_classification)
        assert score == 0.75

    def test_claims_without_label(self):
        c = {
            "classifications": [{"label": "policy", "confidence": 0.8}],
            "economic_claims": [{"claim_text": "$1M cost", "quantitative": True, "amount": "$1M"}],
        }
        assert compute_economic_evidence(c) == 0.75


# ---------------------------------------------------------------------------
# Regulatory Engagement (R) — pure function
# ---------------------------------------------------------------------------

class TestRegulatoryEngagement:
    def test_no_engagement(self, non_substantive_classification):
        score = compute_regulatory_engagement(non_substantive_classification)
        assert score == 0.0

    def test_general_reference(self):
        c = {"provisions_referenced": [], "chain_of_thought": {"provision_engagement": "general mention of the rule"}}
        assert compute_regulatory_engagement(c) == 0.25

    def test_one_specific_cfr_reference(self):
        c = {"provisions_referenced": ["40 CFR Part 141"], "chain_of_thought": {}}
        assert compute_regulatory_engagement(c) == 0.50

    def test_multiple_specific_references(self, legal_classification):
        score = compute_regulatory_engagement(legal_classification)
        assert score == 0.75

    def test_one_nonspecific_reference(self):
        c = {"provisions_referenced": ["the proposed rule"], "chain_of_thought": {}}
        assert compute_regulatory_engagement(c) == 0.25


# ---------------------------------------------------------------------------
# Volume Signal (V) — requires graph mock
# ---------------------------------------------------------------------------

class TestVolumeSignal:
    @patch("analysis.scoring.run_query")
    def test_basic_ratio(self, mock_query):
        mock_query.return_value = [{"cluster_size": 50}]
        v = compute_volume_signal("c1", max_cluster_size=100)
        assert v == 0.5

    @patch("analysis.scoring.run_query")
    def test_campaign_penalty(self, mock_query):
        mock_query.return_value = [{"cluster_size": 50}]
        v = compute_volume_signal("c1", max_cluster_size=100, is_campaign=True)
        assert v == 0.25

    @patch("analysis.scoring.run_query")
    def test_no_theme(self, mock_query):
        mock_query.return_value = []
        assert compute_volume_signal("c1", max_cluster_size=100) == 0.0

    @patch("analysis.scoring.run_query")
    def test_capped_at_one(self, mock_query):
        mock_query.return_value = [{"cluster_size": 200}]
        assert compute_volume_signal("c1", max_cluster_size=100) == 1.0


# ---------------------------------------------------------------------------
# Thematic Centrality (T) — requires graph mock
# ---------------------------------------------------------------------------

class TestThematicCentrality:
    @patch("analysis.scoring.run_query")
    def test_close_to_centroid(self, mock_query):
        mock_query.return_value = [{"dist": 0.1, "prob": 0.9}]
        assert compute_thematic_centrality("c1") == 0.9

    @patch("analysis.scoring.run_query")
    def test_far_from_centroid(self, mock_query):
        mock_query.return_value = [{"dist": 0.8, "prob": 0.3}]
        assert compute_thematic_centrality("c1") == 0.2

    @patch("analysis.scoring.run_query")
    def test_no_theme(self, mock_query):
        mock_query.return_value = []
        assert compute_thematic_centrality("c1") == 0.0


# ---------------------------------------------------------------------------
# Novelty (N) — requires graph mock
# ---------------------------------------------------------------------------

class TestNovelty:
    @patch("analysis.scoring.run_query")
    def test_novel_outlier(self, mock_query):
        mock_query.return_value = [{"is_novel": True, "novel_dist": 0.5, "cluster_size": None, "theme_id": None}]
        n = compute_novelty("c1", median_inter_cluster_dist=0.5)
        assert n == 0.5

    @patch("analysis.scoring.run_query")
    def test_large_cluster_low_novelty(self, mock_query):
        mock_query.side_effect = [
            [{"is_novel": False, "novel_dist": None, "cluster_size": 100, "theme_id": "t1"}],
            [{"total": 500}],
        ]
        n = compute_novelty("c1", median_inter_cluster_dist=0.5)
        assert n == 0.1  # 100/500 = 20% > 5%

    @patch("analysis.scoring.run_query")
    def test_no_result(self, mock_query):
        mock_query.return_value = []
        assert compute_novelty("c1", median_inter_cluster_dist=0.5) == 0.5


# ---------------------------------------------------------------------------
# Credibility (C) — requires graph mock
# ---------------------------------------------------------------------------

class TestCredibility:
    @patch("analysis.scoring.run_query")
    def test_law_firm(self, mock_query):
        mock_query.return_value = [{"ctype": "law_firm"}]
        assert compute_credibility("c1") == 1.0

    @patch("analysis.scoring.run_query")
    def test_individual(self, mock_query):
        mock_query.return_value = [{"ctype": "individual"}]
        assert compute_credibility("c1") == 0.25

    @patch("analysis.scoring.run_query")
    def test_anonymous(self, mock_query):
        mock_query.return_value = [{"ctype": "anonymous"}]
        assert compute_credibility("c1") == 0.0

    @patch("analysis.scoring.run_query")
    def test_no_commenter(self, mock_query):
        mock_query.return_value = []
        assert compute_credibility("c1") == 0.0

    def test_all_types_in_map(self):
        expected = {"anonymous", "individual", "organization", "trade_association", "academic", "law_firm", "government", "congressional"}
        assert set(CREDIBILITY_SCORE_MAP.keys()) == expected


# ---------------------------------------------------------------------------
# Composite CIS — end-to-end with mocks
# ---------------------------------------------------------------------------

class TestComputeCIS:
    @patch("analysis.scoring.compute_credibility", return_value=1.0)
    @patch("analysis.scoring.compute_novelty", return_value=0.8)
    @patch("analysis.scoring.compute_thematic_centrality", return_value=0.9)
    @patch("analysis.scoring.compute_volume_signal", return_value=0.5)
    def test_high_legal_brief(self, mock_v, mock_t, mock_n, mock_c, legal_classification):
        cis = compute_cis("c1", legal_classification)

        assert cis["cis_display"] >= 60
        assert cis["tier"] in ("High", "Critical", "Moderate")
        assert cis["ci_low"] <= cis["cis_display"] <= cis["ci_high"]
        assert set(cis["factors"].keys()) == {"L", "E", "R", "C", "N", "T", "V"}
        assert all(0.0 <= v <= 1.0 for v in cis["factors"].values())

    @patch("analysis.scoring.compute_credibility", return_value=0.0)
    @patch("analysis.scoring.compute_novelty", return_value=0.1)
    @patch("analysis.scoring.compute_thematic_centrality", return_value=0.3)
    @patch("analysis.scoring.compute_volume_signal", return_value=0.8)
    def test_non_substantive_low_score(self, mock_v, mock_t, mock_n, mock_c, non_substantive_classification):
        cis = compute_cis("c1", non_substantive_classification)

        assert cis["cis_display"] < 30
        assert cis["tier"] == "Minimal"

    @patch("analysis.scoring.compute_credibility", return_value=0.5)
    @patch("analysis.scoring.compute_novelty", return_value=0.5)
    @patch("analysis.scoring.compute_thematic_centrality", return_value=0.5)
    @patch("analysis.scoring.compute_volume_signal", return_value=0.5)
    def test_confidence_interval_bounds(self, mock_v, mock_t, mock_n, mock_c, legal_classification):
        cis = compute_cis("c1", legal_classification)

        assert cis["ci_low"] >= 0
        assert cis["ci_high"] <= 100
        assert cis["ci_low"] <= cis["cis_display"]
        assert cis["ci_high"] >= cis["cis_display"]

    def test_tier_boundaries(self):
        """Verify tier assignment thresholds."""
        tiers = [(90, "Critical"), (70, "High"), (50, "Moderate"), (30, "Low"), (10, "Minimal")]
        for score, expected_tier in tiers:
            # Reverse-engineer: if all factors = score/100, CIS = score
            with patch("analysis.scoring.compute_volume_signal", return_value=score / 100), \
                 patch("analysis.scoring.compute_thematic_centrality", return_value=score / 100), \
                 patch("analysis.scoring.compute_novelty", return_value=score / 100), \
                 patch("analysis.scoring.compute_credibility", return_value=score / 100):
                c = {
                    "classifications": [], "legal_citations": [], "economic_claims": [],
                    "provisions_referenced": [], "chain_of_thought": {}, "primary_confidence": 1.0,
                }
                # Override L, E, R to match
                with patch("analysis.scoring.compute_legal_specificity", return_value=score / 100), \
                     patch("analysis.scoring.compute_economic_evidence", return_value=score / 100), \
                     patch("analysis.scoring.compute_regulatory_engagement", return_value=score / 100):
                    cis = compute_cis("c1", c)
                    assert cis["tier"] == expected_tier, f"Score {score} should be {expected_tier}, got {cis['tier']}"
