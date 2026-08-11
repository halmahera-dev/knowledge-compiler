"""What the agent is allowed to link to.

Edges could not span two saves: `_apply_graph` resolved endpoints only against
nodes a single compile established. That guard was right — a saved document is
untrusted text, and text able to name any topic in the workspace can ask for an
edge between a company and a crime — but it also ruled out the most valuable
edge the product can produce, a `contradicts` between two things read weeks
apart.

Cross-document links are now allowed against a candidate set, and the whole
safety of that rests on one property: **the candidate set is derived by the API
and never taken from the request.** These pin that property, because it is the
kind that is easy to undo by accident — adding a convenient field to the request
schema would do it, and nothing else would fail.
"""

from __future__ import annotations

import inspect

from app.schemas import ApplyCompileRequest
from app.services import compile as compile_service


class TestCandidatesAreNotRequestSupplied:
    def test_the_request_carries_no_candidate_list(self):
        # If this fails, someone added a field that lets the caller nominate the
        # nodes it may link to. That is the injection path this design exists to
        # close: the agent proposes edges, the API decides what is reachable.
        suspicious = [
            name
            for name in ApplyCompileRequest.model_fields
            if "candidate" in name or "linkable" in name or "allowed" in name
        ]
        assert suspicious == [], f"request must not carry link candidates: {suspicious}"

    def test_candidates_are_derived_from_the_stored_embedding(self):
        # Re-derived rather than passed through, and from the item's own vector
        # rather than the model's summary of it — the document is the trustworthy
        # input, its summary is model output.
        source = inspect.getsource(compile_service._link_candidates)
        assert "item.embedding" in source
        assert "find_similar_pages" in source

    def test_the_edge_loop_resolves_against_the_derived_set(self):
        # `linkable`, not `nodes`. If this reverts to `nodes`, cross-document
        # edges silently stop being created and the graph fragments again — which
        # looks like the model being conservative, not like a regression.
        source = inspect.getsource(compile_service._apply_graph)
        assert "linkable.get(edge.source" in source
        assert "linkable.get(edge.target" in source

    def test_this_compile_wins_a_label_collision(self):
        # `{**candidates, **nodes}` — the compile's own nodes are applied last, so
        # a concept named the same as an existing page resolves to the node just
        # established rather than to a namesake elsewhere.
        source = inspect.getsource(compile_service._apply_graph)
        assert "{**candidates, **nodes}" in source

    def test_the_merge_target_is_excluded(self):
        # Folding into a page and then drawing an edge to it would have the page
        # extending itself.
        signature = inspect.signature(compile_service._link_candidates)
        assert "exclude_page_id" in signature.parameters
