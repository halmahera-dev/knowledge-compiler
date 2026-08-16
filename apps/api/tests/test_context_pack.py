"""What the copilot is handed before it thinks.

The pack replaces per-question retrieval, so its failure mode is not an error —
it is an agent answering confidently from a briefing that quietly lacks the page
the question was about. The rules below are what keep that from being silent.
"""

from __future__ import annotations

from app.services.context_pack import PageBrief, ThemeBrief, assemble


def page(n: int, summary: str = "x" * 100) -> PageBrief:
    return PageBrief(slug=f"page-{n}", title=f"Page {n}", summary=summary)


def theme(n: int) -> ThemeBrief:
    return ThemeBrief(title=f"Theme {n}", summary="y" * 100, page_count=3)


class TestAssemble:
    def test_everything_fits_and_nothing_is_reported(self):
        pack = assemble([theme(1)], [page(1), page(2)], budget=10_000)

        assert len(pack.pages) == 2
        assert pack.truncation is None

    def test_pages_are_dropped_from_the_end_and_the_loss_is_reported(self):
        pages = [page(n) for n in range(1, 11)]

        pack = assemble([], pages, budget=400)

        assert len(pack.pages) < 10
        # The count has to be in the notice: the agent relays it, and "some
        # pages were left out" is not something a reader can act on.
        assert pack.truncation is not None
        assert f"{len(pack.pages)} of 10" in pack.truncation

    def test_the_pages_kept_are_the_ones_offered_first(self):
        # Callers pass pages most recently compiled first, so dropping from the
        # end is what makes the briefing the *newest* part of the workspace.
        pack = assemble([], [page(n) for n in range(1, 11)], budget=400)

        assert [p.slug for p in pack.pages] == [
            f"page-{n}" for n in range(1, len(pack.pages) + 1)
        ]

    def test_themes_survive_a_budget_too_small_for_the_pages(self):
        # Themes are the map. Dropping them to fit one more page would leave the
        # agent unable to name the area covering what it cannot see.
        pack = assemble(
            [theme(1), theme(2)], [page(n) for n in range(1, 20)], budget=300
        )

        assert len(pack.themes) == 2
        assert pack.truncation is not None

    def test_an_empty_workspace_says_so_rather_than_looking_truncated(self):
        pack = assemble([], [], budget=10_000)

        assert pack.pages == []
        assert pack.themes == []
        assert pack.truncation is None
