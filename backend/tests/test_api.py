"""Tests for FastAPI endpoints using TestClient.

Mocks the Neo4j graph layer so tests run without a database.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client with mocked graph layer."""
    with patch("graph.get_driver") as mock_driver, \
         patch("graph.init_schema"):
        mock_driver.return_value = MagicMock()
        from api.main import app
        yield TestClient(app)


class TestHealthEndpoint:
    def test_health_check(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


class TestDocketEndpoints:
    @patch("graph.run_query")
    def test_list_dockets(self, mock_query, client):
        mock_query.return_value = [
            {"docket_id": "EPA-HQ-OW-2022-0114", "title": "PFAS NPDWR", "comment_count": 1165}
        ]
        resp = client.get("/api/dockets")
        assert resp.status_code == 200

    @patch("graph.run_query")
    def test_docket_stats(self, mock_query, client):
        mock_query.return_value = [{"total": 1165, "classified": 1127}]
        resp = client.get("/api/dockets/EPA-HQ-OW-2022-0114/stats")
        assert resp.status_code == 200


class TestCommentEndpoints:
    @patch("graph.run_query")
    def test_list_comments(self, mock_query, client):
        mock_query.return_value = [
            {"comment_id": "EPA-HQ-OW-2022-0114-0001", "body": "I support this.", "primary_label": "non_substantive"}
        ]
        resp = client.get("/api/comments", params={"docket_id": "EPA-HQ-OW-2022-0114"})
        assert resp.status_code == 200

    @patch("graph.run_query")
    def test_comment_detail(self, mock_query, client):
        mock_query.side_effect = [
            [{"comment_id": "c1", "body": "test", "primary_label": "legal", "impact_score": 75}],  # comment
            [],  # themes
            [],  # legal_citations
            [],  # economic_claims
            [],  # campaign
            [],  # similar
        ]
        resp = client.get("/api/comments/c1")
        assert resp.status_code == 200


class TestAdminEndpoint:
    @patch("graph.run_query")
    def test_admin_status(self, mock_query, client):
        mock_query.return_value = [{"count": 1165}]
        resp = client.get("/api/admin/status")
        assert resp.status_code == 200
