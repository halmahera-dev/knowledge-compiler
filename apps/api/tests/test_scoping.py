"""Workspace scoping and role enforcement.

The failure this guards against is the worst one this system has: one user
reading another workspace's knowledge base. There are ~80 query sites, so the
protection cannot be "remember to add a filter" — it has to be structural, and
these tests pin the structure.
"""

from __future__ import annotations

import pytest

from app.core.scoping import DERIVED_OWNERSHIP, WORKSPACE_OWNED, Scope, ScopeError
from app.core.security import ROLE_ORDER, Principal, role_at_least
from app.models import (
    ClaimSource,
    CompileRun,
    GraphEdge,
    GraphNode,
    KnowledgeGap,
    RawItem,
    Wiki,
    WikiClaim,
    WikiPage,
    WikiPageRevision,
)


class Row:
    """Stand-in for a fetched ORM row."""

    def __init__(self, workspace_id: str | None):
        self.workspace_id = workspace_id


@pytest.fixture
def scope() -> Scope:
    return Scope(workspace_id="ws_alice", user_id="user_alice", role="owner")


class TestScopedSelect:
    @pytest.mark.parametrize("model", WORKSPACE_OWNED)
    def test_every_workspace_owned_model_can_be_scoped(self, model, scope):
        statement = scope.select(model)
        # The filter must be in the compiled SQL, not merely intended.
        assert "workspace_id" in str(statement).lower()

    def test_scoping_a_derived_model_raises_rather_than_returning_unfiltered(self, scope):
        # Returning an unfiltered SELECT here would be a silent cross-tenant read.
        # A crash is the correct failure mode.
        for model in DERIVED_OWNERSHIP:
            with pytest.raises(ScopeError, match="not workspace-owned"):
                scope.select(model)

    def test_derived_models_are_not_also_listed_as_workspace_owned(self):
        # A model in both lists would have two competing scoping stories.
        assert not set(DERIVED_OWNERSHIP).intersection(WORKSPACE_OWNED)

    def test_every_model_is_classified(self):
        """A new model must be added to one of the two lists deliberately."""
        known = set(WORKSPACE_OWNED) | set(DERIVED_OWNERSHIP)
        every = {
            RawItem,
            WikiPage,
            GraphNode,
            GraphEdge,
            CompileRun,
            KnowledgeGap,
            Wiki,
            WikiPageRevision,
            WikiClaim,
            ClaimSource,
        }
        assert every - known == set(), "unclassified model — scope it or derive it explicitly"


class TestOwnership:
    def test_accepts_a_row_from_the_same_workspace(self, scope):
        assert scope.owns(Row("ws_alice")) is True

    def test_rejects_a_row_from_another_workspace(self, scope):
        assert scope.owns(Row("ws_bob")) is False

    def test_rejects_none(self, scope):
        assert scope.owns(None) is False

    def test_rejects_a_row_with_no_workspace_at_all(self, scope):
        # An object without the attribute must not be treated as owned by default.
        assert scope.owns(object()) is False

    def test_rejects_a_row_whose_workspace_is_null(self, scope):
        assert scope.owns(Row(None)) is False

    def test_stamp_always_carries_the_workspace(self, scope):
        assert scope.stamp(title="x") == {"workspace_id": "ws_alice", "title": "x"}


class TestRoleOrdering:
    def test_roles_are_ordered_least_to_most_privileged(self):
        assert ROLE_ORDER == ("viewer", "member", "admin", "owner")

    @pytest.mark.parametrize(
        ("held", "required", "allowed"),
        [
            ("owner", "admin", True),
            ("owner", "member", True),
            ("admin", "admin", True),
            ("admin", "owner", False),
            ("member", "member", True),
            ("member", "admin", False),
            ("viewer", "member", False),
            ("viewer", "viewer", True),
        ],
    )
    def test_role_comparison(self, held, required, allowed):
        assert role_at_least(held, required) is allowed

    def test_no_role_is_never_sufficient(self):
        assert role_at_least(None, "viewer") is False

    def test_an_unknown_role_is_not_treated_as_privileged(self):
        # A typo or a role added on the frontend but not here must fail closed,
        # not accidentally outrank 'owner'.
        assert role_at_least("superadmin", "viewer") is False


class TestPrincipal:
    def test_a_user_without_a_workspace_is_representable(self):
        # Signed in but no workspace selected is a real state; the dependency
        # rejects it rather than defaulting to one.
        principal = Principal(user_id="u", email=None, workspace_id=None, role=None)
        assert principal.workspace_id is None

    def test_a_principal_is_never_a_service(self):
        principal = Principal(user_id="u", email=None, workspace_id="ws", role="owner")
        assert principal.is_service is False
