"""Tests for duplicate detection and campaign clustering logic."""

import numpy as np
from unittest.mock import patch, MagicMock

from processing.normalize import compute_hash


class TestExactDuplicateHashing:
    """Test the hash-based exact duplicate detection foundation."""

    def test_identical_comments_same_hash(self):
        h1 = compute_hash("I support the EPA PFAS regulation for clean water.")
        h2 = compute_hash("I support the EPA PFAS regulation for clean water.")
        assert h1 == h2

    def test_case_variation_same_hash(self):
        h1 = compute_hash("I SUPPORT the epa pfas regulation.")
        h2 = compute_hash("i support the EPA PFAS regulation.")
        assert h1 == h2

    def test_whitespace_variation_same_hash(self):
        h1 = compute_hash("I  support   the regulation.")
        h2 = compute_hash("I support the regulation.")
        assert h1 == h2

    def test_different_comments_different_hash(self):
        h1 = compute_hash("I support the regulation.")
        h2 = compute_hash("I oppose the regulation.")
        assert h1 != h2

    def test_punctuation_variation_same_hash(self):
        h1 = compute_hash("I support this rule!")
        h2 = compute_hash("I support this rule.")
        assert h1 == h2


class TestNearDuplicateSimilarity:
    """Test cosine similarity thresholding for near-duplicate detection."""

    def _make_embeddings(self, n, dim=384):
        """Create L2-normalized random embeddings."""
        rng = np.random.default_rng(42)
        emb = rng.standard_normal((n, dim)).astype(np.float32)
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        return emb / norms

    def _make_near_duplicate_pair(self, dim=384):
        """Create two embeddings that are very similar (cosine > 0.95)."""
        rng = np.random.default_rng(42)
        base = rng.standard_normal(dim).astype(np.float32)
        noise = rng.standard_normal(dim).astype(np.float32) * 0.05
        v1 = base / np.linalg.norm(base)
        v2 = (base + noise)
        v2 = v2 / np.linalg.norm(v2)
        return np.stack([v1, v2])

    @patch("processing.dedup.link_duplicate")
    @patch("processing.dedup.get_settings")
    def test_high_similarity_detected(self, mock_settings, mock_link):
        mock_settings.return_value = MagicMock(near_duplicate_threshold=0.92)
        from processing.dedup import find_near_duplicates

        emb = self._make_near_duplicate_pair()
        ids = ["c1", "c2"]
        pairs = find_near_duplicates(ids, emb)

        assert len(pairs) == 1
        assert pairs[0][2] > 0.92  # similarity

    @patch("processing.dedup.link_duplicate")
    @patch("processing.dedup.get_settings")
    def test_dissimilar_not_flagged(self, mock_settings, mock_link):
        mock_settings.return_value = MagicMock(near_duplicate_threshold=0.92)
        from processing.dedup import find_near_duplicates

        emb = self._make_embeddings(5)
        ids = [f"c{i}" for i in range(5)]
        pairs = find_near_duplicates(ids, emb)

        # Random vectors in 384-dim should have low cosine similarity
        assert len(pairs) == 0


class TestCampaignClustering:
    """Test connected-component campaign classification."""

    def _mock_embeddings(self, n, dim=384):
        rng = np.random.default_rng(42)
        emb = rng.standard_normal((n, dim)).astype(np.float32)
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        return emb / norms

    @patch("processing.dedup.link_comment_campaign")
    @patch("processing.dedup.upsert_campaign")
    @patch("processing.dedup.get_settings")
    def test_organized_campaign(self, mock_settings, mock_upsert, mock_link):
        """51+ members with high similarity = Organized Campaign."""
        mock_settings.return_value = MagicMock(
            campaign_min_organized=50,
            campaign_min_coordinated=10,
            campaign_threshold=0.85,
        )
        from processing.dedup import cluster_campaigns

        n = 55
        ids = [f"c{i}" for i in range(n)]
        # Make all embeddings very similar (organized campaign)
        base = np.ones(384, dtype=np.float32)
        base = base / np.linalg.norm(base)
        rng = np.random.default_rng(42)
        emb = np.tile(base, (n, 1)) + rng.standard_normal((n, 384)).astype(np.float32) * 0.01
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        emb = emb / norms

        # All pairs connected
        pairs = [(ids[i], ids[i + 1], 0.99) for i in range(n - 1)]

        campaigns = cluster_campaigns(pairs, ids, emb)
        assert len(campaigns) == 1
        assert campaigns[0]["classification"] == "Organized Campaign"
        assert campaigns[0]["member_count"] == n

    @patch("processing.dedup.link_comment_campaign")
    @patch("processing.dedup.upsert_campaign")
    @patch("processing.dedup.get_settings")
    def test_coordinated_submission(self, mock_settings, mock_upsert, mock_link):
        """11-50 members = Coordinated Submission."""
        mock_settings.return_value = MagicMock(
            campaign_min_organized=50,
            campaign_min_coordinated=10,
            campaign_threshold=0.85,
        )
        from processing.dedup import cluster_campaigns

        n = 15
        ids = [f"c{i}" for i in range(n)]
        emb = self._mock_embeddings(n)
        pairs = [(ids[i], ids[i + 1], 0.93) for i in range(n - 1)]

        campaigns = cluster_campaigns(pairs, ids, emb)
        assert len(campaigns) == 1
        assert campaigns[0]["classification"] == "Coordinated Submission"

    @patch("processing.dedup.link_comment_campaign")
    @patch("processing.dedup.upsert_campaign")
    @patch("processing.dedup.get_settings")
    def test_informal_group(self, mock_settings, mock_upsert, mock_link):
        """<=10 members = Informal Similarity Group."""
        mock_settings.return_value = MagicMock(
            campaign_min_organized=50,
            campaign_min_coordinated=10,
            campaign_threshold=0.85,
        )
        from processing.dedup import cluster_campaigns

        n = 5
        ids = [f"c{i}" for i in range(n)]
        emb = self._mock_embeddings(n)
        pairs = [(ids[i], ids[i + 1], 0.93) for i in range(n - 1)]

        campaigns = cluster_campaigns(pairs, ids, emb)
        assert len(campaigns) == 1
        assert campaigns[0]["classification"] == "Informal Similarity Group"

    @patch("processing.dedup.link_comment_campaign")
    @patch("processing.dedup.upsert_campaign")
    @patch("processing.dedup.get_settings")
    def test_disconnected_components(self, mock_settings, mock_upsert, mock_link):
        """Two separate groups become two campaigns."""
        mock_settings.return_value = MagicMock(
            campaign_min_organized=50,
            campaign_min_coordinated=10,
            campaign_threshold=0.85,
        )
        from processing.dedup import cluster_campaigns

        ids = [f"c{i}" for i in range(8)]
        emb = self._mock_embeddings(8)

        # Two disconnected groups: c0-c3 and c4-c7
        pairs = [
            ("c0", "c1", 0.95), ("c1", "c2", 0.94), ("c2", "c3", 0.93),
            ("c4", "c5", 0.96), ("c5", "c6", 0.95), ("c6", "c7", 0.94),
        ]

        campaigns = cluster_campaigns(pairs, ids, emb)
        assert len(campaigns) == 2

    @patch("processing.dedup.link_comment_campaign")
    @patch("processing.dedup.upsert_campaign")
    @patch("processing.dedup.get_settings")
    def test_single_pair_ignored(self, mock_settings, mock_upsert, mock_link):
        """A single near-duplicate pair (2 members) still forms a campaign."""
        mock_settings.return_value = MagicMock(
            campaign_min_organized=50,
            campaign_min_coordinated=10,
            campaign_threshold=0.85,
        )
        from processing.dedup import cluster_campaigns

        ids = ["c0", "c1"]
        emb = self._mock_embeddings(2)
        pairs = [("c0", "c1", 0.95)]

        campaigns = cluster_campaigns(pairs, ids, emb)
        assert len(campaigns) == 1
        assert campaigns[0]["member_count"] == 2
