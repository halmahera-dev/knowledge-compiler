"""Renaming a conversation.

The derived title names a thread after the question that opened it — right for
finding it again, wrong once the thread has wandered. Renaming is the only way
back, and until now there was no endpoint for it.

These cover the refusals, which is what this suite can reach: there are no
database fixtures here, so the happy path — the title changing and `updated_at`
deliberately *not* moving, since the list is ordered by it and tidying should not
reorder what is being tidied — is exercised against the running API instead.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.deps import current_scope
from app.core.scoping import Scope
from app.main import app

WORKSPACE = "test-workspace-rename"
OTHER_WORKSPACE = "someone-elses-workspace"


@pytest.fixture
def client():
    app.dependency_overrides[current_scope] = lambda: Scope(
        workspace_id=WORKSPACE, user_id="tester", role="owner"
    )
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestRenameSession:
    def test_a_missing_session_is_not_found(self, client):
        response = client.patch(
            f"/api/v1/chat/sessions/{uuid.uuid4()}", json={"title": "Anything"}
        )
        assert response.status_code == 404

    def test_an_empty_title_is_refused(self, client):
        # The whole point is a title a reader chose; "" is worse than the derived
        # one it would replace.
        response = client.patch(
            f"/api/v1/chat/sessions/{uuid.uuid4()}", json={"title": ""}
        )
        assert response.status_code == 422

    def test_a_title_longer_than_the_column_is_refused(self, client):
        response = client.patch(
            f"/api/v1/chat/sessions/{uuid.uuid4()}", json={"title": "x" * 121}
        )
        assert response.status_code == 422
