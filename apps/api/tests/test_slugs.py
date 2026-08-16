"""Slugs a compiled page may not take.

Pages are served at `/{slug}`, and the web app resolves a static segment before
a dynamic one. A page that took `capture` would therefore be unreachable — not
broken in a way anyone could see, just permanently absent, with the route it
collided with still working. "Capture", "Graph" and "Gaps" are all plausible
titles for a knowledge base about this kind of software, so this is not
hypothetical.

These drive the real `_unique_slug` through a stub session, rather than
re-deriving its rule in the test. A test that mirrors the logic it checks passes
just as happily when the logic changes underneath it.
"""

from __future__ import annotations

import uuid

import pytest

from app.services.compile import RESERVED_SLUGS, _unique_slug

WIKI = uuid.uuid4()


class StubSession:
    """Answers `_unique_slug`'s only query: is this slug taken?

    Records what was asked, so the search order can be asserted rather than
    inferred from the winner.
    """

    def __init__(self, taken: set[str] | None = None) -> None:
        self.taken = taken or set()
        self.asked: list[str] = []

    async def scalar(self, statement):
        # The slug is the second bound parameter of the WHERE clause.
        slug = next(
            value
            for key, value in statement.compile().params.items()
            if isinstance(value, str)
        )
        self.asked.append(slug)
        return uuid.uuid4() if slug in self.taken else None


class TestReservedSlugs:
    def test_every_static_route_is_claimed(self):
        # A new top-level route added without touching this set is the failure
        # this catches.
        for route in (
            "capture",
            "graph",
            "gaps",
            "agent",
            "ai-logs",
            "disputes",
            "login",
            "register",
        ):
            assert route in RESERVED_SLUGS, f"/{route} is a real route but not reserved"

    @pytest.mark.asyncio
    async def test_a_page_titled_capture_does_not_take_the_capture_route(self):
        db = StubSession()
        assert await _unique_slug(db, WIKI, "Capture") == "capture-2"
        # The bare form was never even offered — not merely rejected.
        assert "capture" not in db.asked

    @pytest.mark.asyncio
    async def test_an_ordinary_title_still_gets_its_bare_slug(self):
        # The rule must cost nothing for the overwhelmingly common case.
        db = StubSession()
        assert await _unique_slug(db, WIKI, "Vector Search") == "vector-search"
        assert db.asked == ["vector-search"]

    @pytest.mark.asyncio
    async def test_a_reserved_base_never_appears_however_many_collide(self):
        db = StubSession(taken={f"graph-{n}" for n in range(2, 8)})
        assert await _unique_slug(db, WIKI, "Graph") == "graph-8"
        assert "graph" not in db.asked

    @pytest.mark.asyncio
    async def test_no_candidate_is_tried_twice(self):
        # An earlier version restarted the counter at the value it had just
        # tried, so the first collision check was spent on a known answer.
        db = StubSession(taken={"capture-2", "capture-3"})
        assert await _unique_slug(db, WIKI, "Capture") == "capture-4"
        assert db.asked == sorted(set(db.asked), key=db.asked.index)

    @pytest.mark.asyncio
    async def test_an_ordinary_title_still_suffixes_on_a_real_collision(self):
        db = StubSession(taken={"vector-search"})
        assert await _unique_slug(db, WIKI, "Vector Search") == "vector-search-2"

    @pytest.mark.asyncio
    async def test_a_page_titled_disputes_does_not_take_the_ledger_route(self):
        # The contradiction ledger lives at /disputes, and "Disputes" is a
        # plausible page title for a workspace that reads about anything
        # contested.
        db = StubSession()
        assert await _unique_slug(db, WIKI, "Disputes") == "disputes-2"
        assert "disputes" not in db.asked
