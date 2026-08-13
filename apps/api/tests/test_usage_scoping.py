"""Who a model call is billed to.

The agent is trusted to say what a call cost. It is not trusted to say whose
budget it came out of — that is derived from the run or the chat session named in
the report, exactly as every other internal endpoint derives its workspace.

Copilot answers made that derivation reachable from the browser for the first
time: the page sends the conversation id, so anyone holding a session id from
another workspace could previously have filed spend against it. The report now
also carries the caller's *own* workspace, taken from its signed token, and a
disagreement between the two is refused rather than recorded.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app
from app.models import ChatSession

WORKSPACE = "test-workspace-usage"
OTHER_WORKSPACE = "someone-elses-workspace"


class StubSession:
    """Just enough database for the checks that run before anything is written.

    `record_usage` reads the chat session, decides whose workspace it is, and only
    then writes. Every refusal these tests cover happens before the write, so a
    `get` is the whole surface needed — and a stub makes it obvious that a refused
    report touches nothing.
    """

    def __init__(self, session: ChatSession | None):
        self._session = session
        self.added: list[object] = []
        self.committed = False

    async def get(self, model, ident):  # noqa: ANN001 - mirrors AsyncSession.get
        return self._session

    def add(self, obj) -> None:  # noqa: ANN001
        self.added.append(obj)

    async def commit(self) -> None:
        self.committed = True

    async def flush(self) -> None:
        return None


def build_client(session: ChatSession | None) -> tuple[TestClient, StubSession]:
    db = StubSession(session)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), db


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def chat_session(workspace_id: str) -> ChatSession:
    session = ChatSession()
    session.id = uuid.uuid4()
    session.workspace_id = workspace_id
    return session


def usage_payload(**overrides) -> dict:
    payload = {
        "service": "agent",
        "operation": "copilot",
        "provider": "bedrock-mantle",
        "model": "test-model",
        "inputTokens": 100,
        "outputTokens": 20,
    }
    payload.update(overrides)
    return payload


class TestUsageWorkspace:
    def test_a_report_naming_another_workspace_is_refused(self):
        # The caller's token says one workspace; the session it named belongs to
        # another. Recording this would put someone else's spend on their ledger.
        session = chat_session(OTHER_WORKSPACE)
        client, db = build_client(session)

        response = client.post(
            "/internal/usage",
            json=usage_payload(
                chatSessionId=str(session.id), workspaceId=WORKSPACE
            ),
            headers=internal_headers(),
        )

        assert response.status_code == 403
        assert db.committed is False

    def test_a_matching_workspace_is_recorded(self):
        session = chat_session(WORKSPACE)
        client, _ = build_client(session)

        response = client.post(
            "/internal/usage",
            json=usage_payload(
                chatSessionId=str(session.id), workspaceId=WORKSPACE
            ),
            headers=internal_headers(),
        )

        assert response.status_code == 204

    def test_the_workspace_stays_optional(self):
        # The compile pipeline reports against a run and sends no workspace. That
        # path must keep working — the check is an extra refusal, not a new
        # requirement.
        session = chat_session(WORKSPACE)
        client, _ = build_client(session)

        response = client.post(
            "/internal/usage",
            json=usage_payload(chatSessionId=str(session.id)),
            headers=internal_headers(),
        )

        assert response.status_code == 204

    def test_a_report_with_no_owner_is_refused(self):
        client, _ = build_client(None)

        response = client.post(
            "/internal/usage",
            json=usage_payload(workspaceId=WORKSPACE),
            headers=internal_headers(),
        )

        # Naming only a workspace is precisely what the endpoint must not accept.
        assert response.status_code == 422


def internal_headers() -> dict[str, str]:
    from app.core.config import get_settings

    return {"X-Internal-Token": get_settings().internal_api_token}
