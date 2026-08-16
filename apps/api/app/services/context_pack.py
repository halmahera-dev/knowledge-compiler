"""The briefing the copilot starts every turn with.

Assembled from what the compile pipeline already wrote, which is the whole
point: the reasoning happened when the reader saved something, not when they
asked. Retrieval survives for one job — fetching a verbatim quote to cite.

The budget is the part worth care. A workspace of two hundred pages would blow
the prompt, so pages are dropped from the end; when any are, the pack says so
and the agent is instructed to relay it. Without that the agent answers "your
notes do not cover that" when the truth is "that page did not fit in the
briefing" — and for a product whose value rests on a refusal the reader can
trust, that is the most expensive lie available.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Characters, not tokens: the pack is prose, and a character count needs no
#: tokeniser in the request path. Roughly 6k tokens at four characters each,
#: which leaves the model room to think.
DEFAULT_BUDGET = 24_000


@dataclass(frozen=True)
class PageBrief:
    slug: str
    title: str
    summary: str

    def size(self) -> int:
        return len(self.slug) + len(self.title) + len(self.summary)


@dataclass(frozen=True)
class ThemeBrief:
    title: str
    summary: str
    page_count: int

    def size(self) -> int:
        return len(self.title) + len(self.summary)


@dataclass(frozen=True)
class Pack:
    themes: list[ThemeBrief] = field(default_factory=list)
    pages: list[PageBrief] = field(default_factory=list)
    #: Set only when pages were left out, and phrased so the agent can repeat it.
    truncation: str | None = None


def assemble(
    themes: list[ThemeBrief],
    pages: list[PageBrief],
    budget: int = DEFAULT_BUDGET,
) -> Pack:
    """Fit the briefing into `budget` characters, saying what did not fit.

    Pages are taken in the order given — callers pass the most recently compiled
    first — and dropped from the end, so what survives is the newest part of the
    workspace rather than an arbitrary slice of it.

    Themes are never dropped. They are the map, and an agent that can still name
    the area a missing page belongs to can point at it; one that cannot is left
    guessing whether the workspace covers the subject at all.
    """
    spent = sum(theme.size() for theme in themes)
    kept: list[PageBrief] = []

    for page in pages:
        cost = page.size()

        if spent + cost > budget:
            break

        spent += cost
        kept.append(page)

    if len(kept) == len(pages):
        return Pack(themes=themes, pages=kept, truncation=None)

    return Pack(
        themes=themes,
        pages=kept,
        truncation=(
            f"This briefing lists {len(kept)} of {len(pages)} pages, most "
            "recently compiled first. The rest exist and are searchable."
        ),
    )
