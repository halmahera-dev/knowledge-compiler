"""Which graph edges survive a revert.

Reverting a page is a pointer change for its prose — claims are revision-scoped,
so restoring one is free and exact. Graph edges are not revision-scoped, so they
have to be reconciled by hand, and until recently that reconciliation only ran in
one direction: undoing a compile withdrew its edges, and redoing it did not bring
them back. The page returned; the connections did not, with nothing in the
interface to say so.

The boundary below is the part worth pinning. An exclusive comparison would strip
the edges belonging to the revision being restored, and the resulting page would
read perfectly — the failure is only visible in the graph.
"""

from __future__ import annotations

import pytest

from app.services.compile import edge_visible_at


class TestEdgeVisibleAt:
    def test_edges_from_the_restored_revision_stay(self):
        # The off-by-one. Reverting *to* r2 must keep r2's own edges.
        assert edge_visible_at(2, 2) is True

    def test_edges_from_earlier_revisions_stay(self):
        assert edge_visible_at(1, 4) is True

    def test_edges_from_undone_revisions_go(self):
        assert edge_visible_at(4, 2) is False

    @pytest.mark.parametrize("current", [1, 2, 3, 4])
    def test_the_first_revision_is_always_visible(self, current):
        # r1 is the page's creation; no revert can leave the page with none.
        assert edge_visible_at(1, current) is True

    @pytest.mark.parametrize("revision", [1, 2, 3, 4])
    def test_nothing_is_hidden_at_the_latest_revision(self, revision):
        assert edge_visible_at(revision, 4) is True

    def test_the_rule_is_symmetric_across_a_round_trip(self):
        # Going back to r1 and forward to r4 must end where it started — this is
        # the property that was broken, and it holds only because visibility is
        # stated as an invariant rather than applied as a one-way action.
        created = [1, 2, 3, 4]
        at_start = [r for r in created if edge_visible_at(r, 4)]
        at_r1 = [r for r in created if edge_visible_at(r, 1)]
        back_at_r4 = [r for r in created if edge_visible_at(r, 4)]

        assert at_r1 == [1]
        assert back_at_r4 == at_start

    def test_repeating_a_revert_changes_nothing(self):
        first = [r for r in (1, 2, 3, 4) if edge_visible_at(r, 2)]
        second = [r for r in (1, 2, 3, 4) if edge_visible_at(r, 2)]
        assert first == second == [1, 2]
