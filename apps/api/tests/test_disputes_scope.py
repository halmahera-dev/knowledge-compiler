"""Who can read the workspace's contradictions.

The endpoint takes no workspace argument — it derives one from the caller's own
token, the way every other reader-facing route does. These cover the refusals
and the mounting, which is what this suite can reach without a database.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestDisputesScope:
    def test_the_route_is_mounted(self):
        # `app.routes` reads as empty even with routers mounted; the generated
        # schema is the honest answer.
        paths = app.openapi()["paths"]

        assert "/api/v1/disputes" in paths
        assert "get" in paths["/api/v1/disputes"]

    def test_a_caller_without_a_workspace_is_refused(self):
        # An unauthenticated request must not fall through to another
        # workspace's contradictions.
        with TestClient(app) as client:
            response = client.get("/api/v1/disputes")

        assert response.status_code in (401, 403, 409)
