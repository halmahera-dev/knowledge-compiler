# Compiled Memory and the Contradiction Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The copilot answers from a briefing compiled on the write path instead of searching the corpus per question, and every contradiction the compiler could not reconcile gets a page of its own.

**Architecture:** Two read-only endpoints over data the compile pipeline already writes. `GET /api/v1/copilot/context` returns a token-budgeted briefing (themes, page summaries, open contradictions) that the Mastra `/chat` route injects as a system message before the model thinks. `GET /api/v1/disputes` returns the same contradictions in full for a new `/disputes` page. No migration, no new tables.

**Tech Stack:** FastAPI + SQLAlchemy async (`apps/api`), Mastra + AI SDK v5 (`apps/agent`), Next.js 16 App Router + TanStack Query + shadcn/Base UI (`apps/client`). Tests: pytest (API), vitest (client).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-compiled-memory-and-contradiction-ledger-design.md`. Read it before starting.
- No database migration. Every field read already exists.
- Python: 4-space indent, `from __future__ import annotations`, ruff clean (`cd apps/api && uv run ruff check app/ tests/`).
- TypeScript: **tab** indentation in `apps/client` and `apps/agent`, biome clean.
- Comments explain **why**, never what the next line does. Match the surrounding file's voice.
- API wire format is camelCase via the `Wire` base class in `apps/api/app/schemas.py` — declare fields `snake_case`, they serialise camelCase.
- Three pre-existing API test failures are unrelated to this work and must be left alone: `tests/test_config.py::TestDerivedBedrockSettings::test_reuses_openai_key_as_bedrock_token` and two in `tests/test_embeddings.py`. They fail because the ambient `.env` carries real provider keys. Confirm you added no fourth failure.
- Never commit `.env`. It is gitignored; keep it that way.
- Commit after every task with a conventional-commit message ending:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `apps/api/app/services/context_pack.py` | Pure budget allocation and truncation reporting. The only real logic in the feature. |
| `apps/api/app/services/disputes.py` | One query: disputed claims on current revisions, with both sides. |
| `apps/api/app/api/routers/disputes.py` | `GET /api/v1/disputes`. |
| `apps/api/tests/test_context_pack.py` | Budget, priority order, truncation notice. |
| `apps/api/tests/test_disputes_scope.py` | Endpoint refusals. |
| `apps/client/src/features/disputes/disputes-api.ts` | Types + fetch. |
| `apps/client/src/features/disputes/disputes-cache.ts` | Query key. |
| `apps/client/src/features/disputes/disputes-query-options.ts` | Query options with retry policy. |
| `apps/client/src/features/disputes/dispute-question.ts` | Pure: dispute → the question sent to the copilot. |
| `apps/client/src/features/disputes/dispute-question.test.ts` | Its tests. |
| `apps/client/src/features/disputes/components/disputes-view.tsx` | The page. |
| `apps/client/src/app/(app)/disputes/page.tsx` | Route + metadata. |

**Modified**

| Path | Change |
| --- | --- |
| `apps/api/app/schemas.py` | `ContextPackOut`, `DisputeOut`, `DisputeSideOut`, `PageBriefOut`. |
| `apps/api/app/api/routers/copilot.py` | `GET /context`. |
| `apps/api/app/main.py` | Register the disputes router. |
| `apps/api/app/services/compile.py` | `disputes` joins `RESERVED_SLUGS`. |
| `apps/agent/src/mastra/api.ts` | `fetchContextPack()` against the user's token. |
| `apps/agent/src/mastra/index.ts` | Inject the pack as a system message in `/chat`. |
| `apps/agent/src/mastra/agents/copilot.ts` | Rewritten instructions. |
| `apps/client/src/features/agent/copilot-evidence.ts` | `retrievalCount` on `Evidence`. |
| `apps/client/src/features/agent/components/message-view.tsx` | The evidence line. |
| `apps/client/src/components/sidebar/app-sidebar.tsx` | Contradictions nav entry. |

---

### Task 1: Reserve the `disputes` slug

A compiled page titled "Disputes" would take `/disputes`, and Next resolves a static segment before a dynamic one — the new route would be permanently unreachable. This is the failure phase 0 already paid for, so it goes first.

**Files:**
- Modify: `apps/api/app/services/compile.py:61-75` (the `RESERVED_SLUGS` frozenset)
- Test: `apps/api/tests/test_slugs.py`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Behaviour only.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/test_slugs.py`, inside the existing test class (match the file's existing style — read it first):

```python
    async def test_disputes_is_reserved(self):
        # The contradiction ledger lives at /disputes. A page that took the slug
        # would shadow it forever: Next resolves a static segment before a
        # dynamic one, so /disputes would never reach the page component again.
        db = StubSession(taken=set())
        slug = await _unique_slug(db, WIKI_ID, "Disputes")
        assert slug == "disputes-2"
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/api && uv run pytest tests/test_slugs.py -q
```

Expected: FAIL, `assert 'disputes' == 'disputes-2'`.

- [ ] **Step 3: Add the slug**

In `apps/api/app/services/compile.py`, add `"disputes",` to `RESERVED_SLUGS`, keeping the set alphabetical.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/api && uv run pytest tests/test_slugs.py -q
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/compile.py apps/api/tests/test_slugs.py
git commit -m "fix(api): reserve the disputes slug

The contradiction ledger lives at /disputes. A compiled page that took the
slug would shadow the route permanently, because Next resolves a static
segment before a dynamic one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The context pack's budget

The only real logic in the feature, so it is a pure function with real tests and no database.

**Files:**
- Create: `apps/api/app/services/context_pack.py`
- Test: `apps/api/tests/test_context_pack.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PageBrief` — dataclass: `slug: str`, `title: str`, `summary: str`
  - `ThemeBrief` — dataclass: `title: str`, `summary: str`, `page_count: int`
  - `Pack` — dataclass: `themes: list[ThemeBrief]`, `pages: list[PageBrief]`, `truncation: str | None`
  - `assemble(themes: list[ThemeBrief], pages: list[PageBrief], budget: int) -> Pack`
  - `DEFAULT_BUDGET: int`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_context_pack.py`:

```python
"""What the copilot is handed before it thinks.

The pack replaces per-question retrieval, so its failure mode is not an error —
it is an agent that answers confidently from a briefing quietly missing the page
the question was about. The budget rules below are what keep that from being
silent.
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
        assert pack.truncation is not None
        # The count has to be in the notice: the agent relays it, and "some
        # pages were left out" is not something a reader can act on.
        assert f"{len(pack.pages)} of 10" in pack.truncation

    def test_themes_survive_a_budget_too_small_for_the_pages(self):
        # Themes are the map. Dropping them to fit one more page would leave the
        # agent unable to say which area covers what it cannot see.
        pack = assemble([theme(1), theme(2)], [page(n) for n in range(1, 20)], budget=300)

        assert len(pack.themes) == 2
        assert pack.truncation is not None

    def test_an_empty_workspace_says_so_rather_than_looking_truncated(self):
        pack = assemble([], [], budget=10_000)

        assert pack.pages == []
        assert pack.themes == []
        assert pack.truncation is None
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd apps/api && uv run pytest tests/test_context_pack.py -q
```

Expected: FAIL, `ModuleNotFoundError: No module named 'app.services.context_pack'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/app/services/context_pack.py`:

```python
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

#: Characters, not tokens: the pack is assembled from prose, and a character
#: count needs no tokeniser in the request path. Roughly 6k tokens at four
#: characters each, which leaves the model room to think.
DEFAULT_BUDGET = 24_000


@dataclass(frozen=True)
class PageBrief:
    slug: str
    title: str
    summary: str

    def size(self) -> int:
        return len(self.title) + len(self.summary) + len(self.slug)


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
```

- [ ] **Step 4: Run them and watch them pass**

```bash
cd apps/api && uv run pytest tests/test_context_pack.py -q
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Lint and commit**

```bash
cd apps/api && uv run ruff check app/ tests/
```

Expected: `All checks passed!`

```bash
git add apps/api/app/services/context_pack.py apps/api/tests/test_context_pack.py
git commit -m "feat(api): the context pack's budget

Pages are dropped from the end when the briefing will not fit, and the pack
says how many were left out so the agent can relay it. Themes are never the
thing dropped: they are what lets an answer point at the area a missing page
belongs to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Reading disputes out of the database

**Files:**
- Create: `apps/api/app/services/disputes.py`
- Modify: `apps/api/app/schemas.py` (append to the wiki section, after `RevertRequest`)

**Interfaces:**
- Consumes: `Scope` from `app.core.scoping`, models `WikiClaim`, `ClaimSource`, `WikiPage`, `RawItem` from `app.models`.
- Produces:
  - `DisputeSide` — dataclass: `stance: str`, `quote: str`, `source_title: str | None`, `source_url: str | None`, `saved_at: datetime`
  - `DisputeView` — dataclass: `claim_id: uuid.UUID`, `text: str`, `section: str`, `page_slug: str`, `page_title: str`, `sides: list[DisputeSide]`
  - `async def open_disputes(db: AsyncSession, scope: Scope, limit: int = 100) -> list[DisputeView]`
  - Schemas `DisputeSideOut`, `DisputeOut`

- [ ] **Step 1: Write the service**

Create `apps/api/app/services/disputes.py`:

```python
"""Claims the compiler could not reconcile.

A dispute is the one thing this product has that a summariser does not: two
sources saying incompatible things, both kept, each with the passage it came
from. Deciding between them is the reader's job, and the compiler refusing to do
it quietly is the feature.

Scoped to each page's *current* revision. Claims belong to revisions, so without
that filter a dispute undone by a rollback comes back as though it were live.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoping import Scope
from app.models import ClaimSource, RawItem, WikiClaim, WikiPage


@dataclass(frozen=True)
class DisputeSide:
    stance: str
    quote: str
    source_title: str | None
    source_url: str | None
    saved_at: dt.datetime


@dataclass(frozen=True)
class DisputeView:
    claim_id: uuid.UUID
    text: str
    section: str
    page_slug: str
    page_title: str
    sides: list[DisputeSide]


async def open_disputes(
    db: AsyncSession, scope: Scope, limit: int = 100
) -> list[DisputeView]:
    """Every unreconciled claim in the workspace, newest first."""
    rows = (
        await db.execute(
            select(WikiClaim, WikiPage)
            .join(WikiPage, WikiPage.id == WikiClaim.page_id)
            .where(
                WikiPage.workspace_id == scope.workspace_id,
                # The live revision only. A rolled-back dispute is not a dispute.
                WikiClaim.revision_id == WikiPage.current_revision_id,
                WikiClaim.status == "disputed",
            )
            .order_by(WikiClaim.created_at.desc())
            .limit(limit)
        )
    ).all()

    if not rows:
        return []

    claim_ids = [claim.id for claim, _ in rows]

    sources = (
        await db.execute(
            select(ClaimSource, RawItem)
            .join(RawItem, RawItem.id == ClaimSource.raw_item_id)
            .where(ClaimSource.claim_id.in_(claim_ids))
        )
    ).all()

    by_claim: dict[uuid.UUID, list[DisputeSide]] = {}
    for source, item in sources:
        by_claim.setdefault(source.claim_id, []).append(
            DisputeSide(
                stance=source.stance,
                quote=source.quote,
                source_title=item.title,
                source_url=item.source_url,
                saved_at=item.created_at,
            )
        )

    return [
        DisputeView(
            claim_id=claim.id,
            text=claim.text,
            section=claim.section,
            page_slug=page.slug,
            page_title=page.title,
            # Contradicting side first: the reader already knows the page's
            # position, and the surprise is what argues against it.
            sides=sorted(
                by_claim.get(claim.id, []),
                key=lambda side: side.stance != "contradicts",
            ),
        )
        for claim, page in rows
    ]
```

- [ ] **Step 2: Add the schemas**

In `apps/api/app/schemas.py`, directly after the `RevertRequest` class:

```python
class DisputeSideOut(Wire):
    stance: SourceStance
    quote: str
    source_title: str | None = None
    source_url: str | None = None
    saved_at: dt.datetime


class DisputeOut(Wire):
    """A claim two sources disagree about, with both passages.

    Both sides travel together and always. A dispute rendered as one side plus a
    warning badge is a summary that picked a winner and then apologised for it.
    """

    claim_id: uuid.UUID
    text: str
    section: str
    page_slug: str
    page_title: str
    sides: list[DisputeSideOut] = Field(default_factory=list)
```

- [ ] **Step 3: Verify it imports and the types line up**

```bash
cd apps/api && uv run python -c "from app.services.disputes import open_disputes; from app.schemas import DisputeOut; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Lint**

```bash
cd apps/api && uv run ruff check app/
```

Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/disputes.py apps/api/app/schemas.py
git commit -m "feat(api): read unreconciled claims with both sides

Filtered to each page's current revision — claims belong to revisions, so
without it a dispute undone by a rollback returns as though it were live.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /api/v1/disputes`

**Files:**
- Create: `apps/api/app/api/routers/disputes.py`
- Modify: `apps/api/app/main.py:106-113` (the `include_router` block)
- Test: `apps/api/tests/test_disputes_scope.py`

**Interfaces:**
- Consumes: `open_disputes`, `DisputeOut`, `DisputeSideOut` from Task 3.
- Produces: `router` — mounted at `/api/v1/disputes`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_disputes_scope.py`:

```python
"""Who can read the workspace's contradictions.

The endpoint takes no workspace argument — it derives one from the caller's
token, the same way every other reader-facing route does. These cover the
refusals, which is what this suite can reach without a database.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import current_scope
from app.core.scoping import Scope
from app.main import app

WORKSPACE = "test-workspace-disputes"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestDisputesScope:
    def test_a_caller_with_no_workspace_is_refused(self):
        # current_scope raises 409 when the token names no workspace; the route
        # must not answer with another workspace's contradictions in that case.
        with TestClient(app) as client:
            response = client.get("/api/v1/disputes")

        assert response.status_code in (401, 409)

    def test_the_route_is_mounted(self):
        paths = app.openapi()["paths"]
        assert "/api/v1/disputes" in paths
        assert "get" in paths["/api/v1/disputes"]
```

Note: read `app.routes` will look empty even when routers are mounted — assert against `app.openapi()` as above.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/api && uv run pytest tests/test_disputes_scope.py -q
```

Expected: FAIL on `test_the_route_is_mounted` — `/api/v1/disputes` not in paths.

- [ ] **Step 3: Write the router**

Create `apps/api/app/api/routers/disputes.py`:

```python
"""The workspace's open contradictions.

A page shows the disputes on it. This is the other question — what does my
library disagree with itself about — which no page can answer alone.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import DbDep, ScopeDep
from app.schemas import DisputeOut, DisputeSideOut
from app.services.disputes import open_disputes

router = APIRouter(prefix="/api/v1/disputes", tags=["disputes"])


@router.get("", response_model=list[DisputeOut])
async def list_disputes(
    db: DbDep, scope: ScopeDep, limit: int = Query(100, ge=1, le=500)
) -> list[DisputeOut]:
    return [
        DisputeOut(
            claim_id=view.claim_id,
            text=view.text,
            section=view.section,
            page_slug=view.page_slug,
            page_title=view.page_title,
            sides=[
                DisputeSideOut(
                    stance=side.stance,
                    quote=side.quote,
                    source_title=side.source_title,
                    source_url=side.source_url,
                    saved_at=side.saved_at,
                )
                for side in view.sides
            ],
        )
        for view in await open_disputes(db, scope, limit=limit)
    ]
```

- [ ] **Step 4: Mount it**

In `apps/api/app/main.py`, add the import beside the other routers and register it after `copilot`:

```python
app.include_router(disputes.router)
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd apps/api && uv run pytest tests/test_disputes_scope.py -q && uv run ruff check app/ tests/
```

Expected: 2 passed, `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/api/routers/disputes.py apps/api/app/main.py apps/api/tests/test_disputes_scope.py
git commit -m "feat(api): GET /api/v1/disputes

What does my library disagree with itself about — the question no single page
can answer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `GET /api/v1/copilot/context`

**Files:**
- Modify: `apps/api/app/api/routers/copilot.py` (append the endpoint)
- Modify: `apps/api/app/schemas.py` (append after `CopilotSearchResponse`)

**Interfaces:**
- Consumes: `assemble`, `PageBrief`, `ThemeBrief`, `DEFAULT_BUDGET` (Task 2); `open_disputes`, `DisputeOut`, `DisputeSideOut` (Tasks 3–4); `overview` from `app.services.communities`.
- Produces: schema `PageBriefOut` (`slug`, `title`, `summary`) and `ContextPackOut` with fields `page_count: int`, `claim_count: int`, `source_count: int`, `themes: list[ThemeOut]`, `pages: list[PageBriefOut]`, `disputes: list[DisputeOut]`, `truncation: str | None`. Endpoint `GET /api/v1/copilot/context`.

- [ ] **Step 1: Add the schemas**

In `apps/api/app/schemas.py`, after `CopilotSearchResponse`:

```python
class PageBriefOut(Wire):
    slug: str
    title: str
    summary: str


class ContextPackOut(Wire):
    """Everything the copilot knows before it is asked anything.

    Compiled on the write path and merely read here. `truncation` is set only
    when pages were left out, and the agent is instructed to repeat it verbatim
    — an agent that says "your notes do not cover that" about a page that simply
    did not fit has told the reader something false in the product's own voice.
    """

    page_count: int
    claim_count: int
    source_count: int
    themes: list[ThemeOut] = Field(default_factory=list)
    pages: list[PageBriefOut] = Field(default_factory=list)
    disputes: list[DisputeOut] = Field(default_factory=list)
    truncation: str | None = None
```

- [ ] **Step 2: Write the endpoint**

Append to `apps/api/app/api/routers/copilot.py`:

```python
@router.get("/context", response_model=ContextPackOut)
async def context(db: DbDep, scope: ScopeDep) -> ContextPackOut:
    """The briefing the agent starts a turn with, instead of searching.

    Every figure here was computed when the reader saved something. Nothing in
    this request reads a source document or embeds anything.
    """
    pages = (
        await db.scalars(
            select(WikiPage)
            .where(WikiPage.workspace_id == scope.workspace_id)
            .order_by(WikiPage.updated_at.desc())
        )
    ).all()

    claim_count = (
        await db.scalar(
            select(func.count())
            .select_from(WikiClaim)
            .join(WikiPage, WikiPage.id == WikiClaim.page_id)
            .where(
                WikiPage.workspace_id == scope.workspace_id,
                WikiClaim.revision_id == WikiPage.current_revision_id,
            )
        )
    ) or 0

    source_count = (
        await db.scalar(
            select(func.count())
            .select_from(RawItem)
            .where(RawItem.workspace_id == scope.workspace_id)
        )
    ) or 0

    themes = [
        ThemeBrief(title=view.title, summary=view.summary, page_count=view.page_count)
        for view in await overview(db, scope)
        if view.title and view.summary
    ][:MAX_THEMES]

    pack = assemble(
        themes,
        [
            PageBrief(slug=page.slug, title=page.title, summary=page.summary)
            for page in pages
        ],
    )

    disputes = await open_disputes(db, scope, limit=MAX_DISPUTES)

    return ContextPackOut(
        page_count=len(pages),
        claim_count=claim_count,
        source_count=source_count,
        themes=[
            ThemeOut(
                title=theme.title,
                summary=theme.summary,
                node_count=0,
                page_count=theme.page_count,
            )
            for theme in pack.themes
        ],
        pages=[
            PageBriefOut(slug=page.slug, title=page.title, summary=page.summary)
            for page in pack.pages
        ],
        disputes=[
            DisputeOut(
                claim_id=view.claim_id,
                text=view.text,
                section=view.section,
                page_slug=view.page_slug,
                page_title=view.page_title,
                sides=[
                    DisputeSideOut(
                        stance=side.stance,
                        quote=side.quote,
                        source_title=side.source_title,
                        source_url=side.source_url,
                        saved_at=side.saved_at,
                    )
                    for side in view.sides
                ],
            )
            for view in disputes
        ],
        truncation=pack.truncation,
    )
```

Add at the top of the file, beside the existing imports:

```python
from sqlalchemy import func, select

from app.models import RawItem, WikiClaim, WikiPage
from app.schemas import ContextPackOut, DisputeOut, DisputeSideOut, PageBriefOut
from app.services.context_pack import PageBrief, ThemeBrief, assemble
from app.services.disputes import open_disputes
```

And beside `MAX_THEMES`:

```python
#: Contradictions carried in the pack. They are the product's point, so the
#: ceiling is generous — but a workspace arguing with itself two hundred times
#: needs the ledger page, not a longer prompt.
MAX_DISPUTES = 20
```

- [ ] **Step 3: Verify the route is mounted and typed**

```bash
cd apps/api && uv run python -c "from app.main import app; p=app.openapi()['paths']; print(sorted(k for k in p if 'copilot' in k))"
```

Expected: `['/api/v1/copilot/context', '/api/v1/copilot/search']`

- [ ] **Step 4: Run the whole suite and lint**

```bash
cd apps/api && uv run pytest -q ; uv run ruff check app/ tests/
```

Expected: the three known pre-existing failures and no others; `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/api/routers/copilot.py apps/api/app/schemas.py
git commit -m "feat(api): GET /api/v1/copilot/context

The briefing the copilot starts a turn with: themes, page summaries and every
open contradiction, all compiled on the write path. Nothing here reads a source
document or embeds anything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The agent fetches and injects the pack

**Files:**
- Modify: `apps/agent/src/mastra/api.ts` (append)
- Modify: `apps/agent/src/mastra/index.ts` (the `/chat` route handler)

**Interfaces:**
- Consumes: `GET /api/v1/copilot/context` (Task 5).
- Produces:
  - `fetchContextPack(token: string): Promise<ContextPack | null>` in `api.ts`
  - `interface ContextPack` with `pageCount`, `claimCount`, `sourceCount`, `themes`, `pages`, `disputes`, `truncation`
  - `renderContextPack(pack: ContextPack | null): string` in `api.ts`

- [ ] **Step 1: Add the client and the renderer**

Append to `apps/agent/src/mastra/api.ts` (2-space indent — match the file):

```typescript
export interface ContextPack {
  pageCount: number;
  claimCount: number;
  sourceCount: number;
  themes: { title: string; summary: string; pageCount: number }[];
  pages: { slug: string; title: string; summary: string }[];
  disputes: {
    text: string;
    pageSlug: string;
    pageTitle: string;
    sides: { stance: string; quote: string; sourceTitle: string | null }[];
  }[];
  truncation: string | null;
}

/**
 * The reader's compiled workspace, fetched with their own token.
 *
 * Not through `request()`: that carries the shared internal token, and this is a
 * user-scoped route on purpose — the workspace comes from the caller's own
 * claim, so the agent never names one.
 *
 * Returns null rather than throwing. A briefing that could not be fetched must
 * degrade to the old search-first behaviour, not take the answer down with it.
 */
export async function fetchContextPack(
  token: string,
): Promise<ContextPack | null> {
  try {
    const response = await fetch(`${config.api.baseUrl}/api/v1/copilot/context`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return (await response.json()) as ContextPack;
  } catch {
    return null;
  }
}

/** The pack as the model reads it. Plain prose: it is being read, not parsed. */
export function renderContextPack(pack: ContextPack | null): string {
  if (!pack) {
    return [
      "YOUR BRIEFING IS UNAVAILABLE this turn — the workspace could not be",
      "loaded. Fall back to searching before you answer, and do not tell the",
      "reader their notes are empty; you simply cannot see them right now.",
    ].join(" ");
  }

  const lines: string[] = [
    "THIS WORKSPACE, COMPILED.",
    "",
    `${pack.pageCount} pages, ${pack.claimCount} claims, from ${pack.sourceCount} saved sources.`,
  ];

  if (pack.themes.length > 0) {
    lines.push("", "AREAS THIS WORKSPACE COVERS");
    for (const theme of pack.themes) {
      lines.push(`- ${theme.title} (${theme.pageCount} pages): ${theme.summary}`);
    }
  }

  if (pack.pages.length > 0) {
    lines.push("", "PAGES");
    for (const page of pack.pages) {
      lines.push(`- ${page.title} (/${page.slug}): ${page.summary}`);
    }
  }

  if (pack.disputes.length > 0) {
    lines.push("", "OPEN CONTRADICTIONS — sources that disagree, both kept");
    for (const dispute of pack.disputes) {
      lines.push(`- ${dispute.text} (on /${dispute.pageSlug})`);
      for (const side of dispute.sides) {
        lines.push(
          `    ${side.stance}: "${side.quote}" — ${side.sourceTitle ?? "untitled source"}`,
        );
      }
    }
  }

  if (pack.truncation) {
    lines.push("", `NOTE: ${pack.truncation}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Inject it in the `/chat` route**

In `apps/agent/src/mastra/index.ts`, inside the `/chat` handler, after `const chatSessionId = ...` and before `handleChatStream`:

```typescript
          // The briefing, fetched with the reader's own token and rebuilt every
          // turn. Never persisted into the thread: a pack stored with the
          // conversation would make turn ten stand on the workspace as it was at
          // turn one, possibly several compiles ago.
          const pack = await fetchContextPack(token);
          const briefing = renderContextPack(pack);
```

Then change the `params.messages` line to prepend the briefing as a system message:

```typescript
              messages: [
                { role: "system", parts: [{ type: "text", text: briefing }] },
                ...body.messages,
              ],
```

Add to the import from `./api`:

```typescript
import { fetchContextPack, renderContextPack, reportUsage } from "./api";
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter agent exec tsc --noEmit
```

Expected: no output (an "Unsupported engine" warning from pnpm is expected and unrelated).

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/mastra/api.ts apps/agent/src/mastra/index.ts
git commit -m "feat(agent): hand the copilot its compiled workspace

Every turn begins with a briefing built on the write path rather than a search
issued at question time. A failed fetch degrades to the old behaviour instead of
taking the answer down.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The copilot's instructions

The behavioural change. Small diff, largest consequence.

**Files:**
- Modify: `apps/agent/src/mastra/agents/copilot.ts` (the `instructions` string)

**Interfaces:**
- Consumes: the system message from Task 6.
- Produces: nothing importable.

- [ ] **Step 1: Replace the instructions**

Replace the `instructions` template literal in `apps/agent/src/mastra/agents/copilot.ts` with:

```typescript
  instructions: `You answer questions about a person's own compiled knowledge base.

Every turn begins with a briefing of their workspace: the areas it covers, every
page and what each one is about, and every contradiction still open. That
briefing IS your memory. It was assembled when the reader saved things, not
looked up when they asked.

You also have one tool, searchKnowledge, which returns CLAIMS — each with the
verbatim quote from the source it came from.

Rules, in order of importance:

1. Answer from the briefing. Do not search to find out what the workspace
   contains; you already know.

2. Call searchKnowledge in exactly two cases, and say which one applies:
   - you are about to state something specific and want the verbatim quote
     behind it, so the reader can check it;
   - the briefing does not reach the question, including when it says it lists
     only some of the pages.

3. If searchKnowledge returns 'blocked', relay that message verbatim and stop.
   Do not rephrase it, add to it, or attempt to answer around it.

4. Cite two different ways, and never confuse them:
   - a claim you retrieved carries a verbatim quote — reference it as [c1], [c2]
     matching the label on each claim;
   - anything resting on the briefing links the page instead, as an ordinary
     markdown link: [Page title](/page-slug).
   A page summary is prose the compiler wrote, one remove from the source, with
   nothing to check it against. Giving it a citation marker would make two
   different levels of trust look identical.

5. When contradictions in the briefing bear on the question, say so explicitly
   and present both sides with their quotes. Do not quietly pick a winner — the
   reader saved both sources and is entitled to know they disagree.

6. Refuse precisely. If neither the briefing nor a search covers the question,
   say so and name what is missing. If the briefing told you it lists only some
   of the pages, say THAT instead — "your notes don't cover this" and "that page
   wasn't in my briefing" are different statements, and only one of them is true.

7. Write plainly, in the reader's own register. This is their material; do not
   lecture them about it, and do not pad with "based on your knowledge base"
   preambles. Answer the question.

8. Never speculate beyond the briefing and the claims, even when the answer
   seems obvious. If you find yourself reaching for general knowledge, that is
   the signal to refuse.`,
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter agent exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/mastra/agents/copilot.ts
git commit -m "feat(agent): answer from the briefing, search only to quote

Rule one used to be 'call searchKnowledge for every question', which made the
product's own claim — compile once, do not retrieve per query — untrue at the
moment it mattered. Citations split in two: markers stay reserved for claims
whose quote was actually retrieved, and briefing-based answers link the page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Show that no retrieval happened

**Files:**
- Modify: `apps/client/src/features/agent/copilot-evidence.ts`
- Modify: `apps/client/src/features/agent/components/message-view.tsx`
- Test: `apps/client/src/features/agent/copilot-evidence.test.ts`

**Interfaces:**
- Consumes: `Evidence` from `copilot-evidence.ts`.
- Produces: `Evidence.retrievalCount: number` — how many `searchKnowledge` calls produced output this turn.

- [ ] **Step 1: Write the failing test**

Append to `apps/client/src/features/agent/copilot-evidence.test.ts`, matching the file's existing helpers:

```typescript
describe("retrievalCount", () => {
	test("is zero when the answer came from the briefing alone", () => {
		const message = assistantMessage("Answered from what was compiled.", []);

		expect(readEvidence(message).retrievalCount).toBe(0);
	});

	test("counts each search that returned something", () => {
		// The claim the product makes is about how often it searches, so the
		// number under the answer has to be the real one.
		const message = assistantMessage("With a quote [c1].", [
			{ claims: [claim("c1")] },
			{ claims: [claim("c2")] },
		]);

		expect(readEvidence(message).retrievalCount).toBe(2);
	});
});
```

If the existing file has no `assistantMessage`/`claim` helpers under those names, read the file and reuse whatever it does define — do not invent a second set.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/client && pnpm exec vitest run src/features/agent/copilot-evidence.test.ts
```

Expected: FAIL — `retrievalCount` is `undefined`.

- [ ] **Step 3: Implement**

In `copilot-evidence.ts`, add to the `Evidence` interface:

```typescript
	/**
	 * How many searches this answer needed. Zero is the ordinary case now: the
	 * briefing is compiled on the write path, and retrieval is for quoting.
	 */
	retrievalCount: number;
```

Set it in both branches of `readEvidence` — the stored-metadata path and the tool-part path. For the stored path the count is not recoverable, so use `0` and note why; for the live path it is the number of tool outputs read.

- [ ] **Step 4: Show it under the answer**

In `message-view.tsx`, inside the `MessageFooter` (beside `ConsultedClaims`), add:

```tsx
						<span className="text-muted-foreground text-xs">
							{evidence.retrievalCount === 0
								? "Answered from compiled memory — no retrieval"
								: `Pulled ${evidence.retrievalCount} quote${evidence.retrievalCount === 1 ? "" : "s"} from the source`}
						</span>
```

- [ ] **Step 5: Run the tests and typecheck**

```bash
cd apps/client && pnpm exec vitest run && pnpm exec tsc --noEmit
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/agent/copilot-evidence.ts apps/client/src/features/agent/copilot-evidence.test.ts apps/client/src/features/agent/components/message-view.tsx
git commit -m "feat(client): say how many searches an answer needed

Zero is the ordinary case once the briefing is compiled on the write path. The
line under the answer is the only place that claim is visible to a reader.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: The question a dispute sends to the copilot

Pure, so it is tested properly before any component depends on it.

**Files:**
- Create: `apps/client/src/features/disputes/dispute-question.ts`
- Test: `apps/client/src/features/disputes/dispute-question.test.ts`

**Interfaces:**
- Produces: `questionFor(dispute: { text: string; pageTitle: string }): string`

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/features/disputes/dispute-question.test.ts`:

```typescript
/**
 * The ledger hands the copilot a question, not a command. It has to name the
 * disagreement precisely enough that the answer is about the sources rather
 * than about the subject in general — the copilot answers from compiled claims,
 * and a vague question gets a vague refusal.
 */
import { describe, expect, test } from "vitest";
import { questionFor } from "./dispute-question";

describe("questionFor", () => {
	test("names the claim and the page it sits on", () => {
		const question = questionFor({
			text: "4-bit quantisation is near-lossless above 7B parameters.",
			pageTitle: "Post-training quantisation",
		});

		expect(question).toContain(
			"4-bit quantisation is near-lossless above 7B parameters.",
		);
		expect(question).toContain("Post-training quantisation");
	});

	test("asks for both sides rather than for a verdict", () => {
		// A question that asks which source is right invites the copilot to do
		// the one thing this product refuses to do on the reader's behalf.
		const question = questionFor({ text: "X", pageTitle: "Y" }).toLowerCase();

		expect(question).toContain("both");
		expect(question).not.toContain("which is right");
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/client && pnpm exec vitest run src/features/disputes/dispute-question.test.ts
```

Expected: FAIL — cannot resolve `./dispute-question`.

- [ ] **Step 3: Implement**

Create `apps/client/src/features/disputes/dispute-question.ts`:

```typescript
/**
 * What the ledger asks the copilot on the reader's behalf.
 *
 * Phrased to ask for both sides and what separates them, never for a verdict.
 * The product's whole position is that deciding between two sources is the
 * reader's job; a button that asked the model to settle it would undo that in
 * one click.
 */
export function questionFor(dispute: {
	text: string;
	pageTitle: string;
}): string {
	return `My sources disagree about this claim on ${dispute.pageTitle}: "${dispute.text}" — set out both sides and what separates them.`;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd apps/client && pnpm exec vitest run src/features/disputes/dispute-question.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/disputes/dispute-question.ts apps/client/src/features/disputes/dispute-question.test.ts
git commit -m "feat(client): the question a contradiction sends to the copilot

Asks for both sides and what separates them, never for a verdict — deciding
between two sources is the reader's job.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: The contradictions page

**Files:**
- Create: `apps/client/src/features/disputes/disputes-api.ts`
- Create: `apps/client/src/features/disputes/disputes-cache.ts`
- Create: `apps/client/src/features/disputes/disputes-query-options.ts`
- Create: `apps/client/src/features/disputes/components/disputes-view.tsx`
- Create: `apps/client/src/app/(app)/disputes/page.tsx`
- Modify: `apps/client/src/components/sidebar/app-sidebar.tsx`

**Interfaces:**
- Consumes: `questionFor` (Task 9); `setComposerDraft` from `@/features/agent/pending-message`; `GET /api/v1/disputes` (Task 4).
- Produces: `Dispute`, `DisputeSide` types; `disputesQueryOptions()`; `DisputesView`.

- [ ] **Step 1: The data layer**

`apps/client/src/features/disputes/disputes-api.ts`:

```typescript
/**
 * Claims the compiler could not reconcile.
 *
 * Raised on the write path, like gaps — this is a view onto what the compiler
 * noticed, and there is deliberately nothing here to resolve them with.
 */
import { request } from "@/lib/api-client";

export interface DisputeSide {
	stance: "supports" | "contradicts";
	quote: string;
	sourceTitle: string | null;
	sourceUrl: string | null;
	savedAt: string;
}

export interface Dispute {
	claimId: string;
	text: string;
	section: string;
	pageSlug: string;
	pageTitle: string;
	sides: DisputeSide[];
}

export function fetchDisputes(): Promise<Dispute[]> {
	return request<Dispute[]>("/api/v1/disputes");
}
```

`apps/client/src/features/disputes/disputes-cache.ts`:

```typescript
export const disputesKeys = {
	list: () => ["disputes", "list"] as const,
};
```

`apps/client/src/features/disputes/disputes-query-options.ts`:

```typescript
import { queryOptions } from "@tanstack/react-query";
import { disputesKeys } from "@/features/disputes/disputes-cache";
import { fetchDisputes } from "@/features/disputes/disputes-api";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function disputesQueryOptions() {
	return queryOptions({
		queryKey: disputesKeys.list(),
		queryFn: fetchDisputes,
		retry: retryUnlessSignedOut,
	});
}
```

- [ ] **Step 2: The view**

`apps/client/src/features/disputes/components/disputes-view.tsx`:

```tsx
"use client";

import { Badge } from "@kc/ui/components/badge";
import { Button } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { QueryError, QuerySkeleton } from "@/components/query-states";
import { setComposerDraft } from "@/features/agent/pending-message";
import type { Dispute } from "@/features/disputes/disputes-api";
import { disputesQueryOptions } from "@/features/disputes/disputes-query-options";
import { questionFor } from "@/features/disputes/dispute-question";

/**
 * What this library disagrees with itself about.
 *
 * A page shows the disputes on it; this is the question no page can answer
 * alone. There is no button to resolve one, and that is the product's position
 * rather than an omission: closing a contradiction asks the reader to decide,
 * then makes the product forget the disagreement ever happened.
 */

function DisputeCard({ dispute }: { dispute: Dispute }) {
	const router = useRouter();

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<p className="font-medium">{dispute.text}</p>

				<ul className="flex flex-col gap-3">
					{dispute.sides.map((side) => (
						<li
							key={`${dispute.claimId}-${side.quote}`}
							className="border-border border-l-2 pl-3"
						>
							<Badge
								variant={side.stance === "contradicts" ? "destructive" : "secondary"}
							>
								{side.stance}
							</Badge>
							<blockquote className="mt-1 text-muted-foreground italic leading-relaxed">
								“{side.quote}”
							</blockquote>
							<p className="mt-1 text-muted-foreground text-xs">
								{side.sourceUrl ? (
									<a
										href={side.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="underline underline-offset-2"
									>
										{side.sourceTitle ?? side.sourceUrl}
									</a>
								) : (
									(side.sourceTitle ?? "untitled source")
								)}
								{" · saved "}
								{new Date(side.savedAt).toLocaleDateString()}
							</p>
						</li>
					))}
				</ul>

				<div className="flex flex-wrap items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setComposerDraft(questionFor(dispute));
							router.push("/agent");
						}}
					>
						Ask the copilot
					</Button>
					<Link
						href={`/${dispute.pageSlug}`}
						className="text-muted-foreground text-sm underline underline-offset-2 hover:text-foreground"
					>
						{dispute.pageTitle}
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

export function DisputesView() {
	const { data, isPending, error } = useQuery(disputesQueryOptions());

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Contradictions">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Where your sources disagree — both sides kept
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				{isPending ? (
					<QuerySkeleton rows={3} className="h-40 rounded-xl" />
				) : error ? (
					<QueryError error={error} />
				) : data.length === 0 ? (
					<Empty>
						<EmptyTitle>Nothing disagrees yet</EmptyTitle>
						<EmptyDescription>
							A contradiction appears when a new source contests a claim your
							library already compiled.
						</EmptyDescription>
					</Empty>
				) : (
					<div className="flex flex-col gap-4">
						{data.map((dispute) => (
							<DisputeCard key={dispute.claimId} dispute={dispute} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: The route**

`apps/client/src/app/(app)/disputes/page.tsx`:

```tsx
import type { Metadata } from "next";
import { DisputesView } from "@/features/disputes/components/disputes-view";

export const metadata: Metadata = { title: "Contradictions" };

export default function DisputesPage() {
	return <DisputesView />;
}
```

- [ ] **Step 4: The nav entry**

In `apps/client/src/components/sidebar/app-sidebar.tsx`, add an item after Gaps, matching the surrounding blocks exactly:

```tsx
						<SidebarMenuItem>
							<SidebarMenuButton
								data-tour="nav-disputes"
								isActive={pathname === "/disputes"}
								render={<Link href="/disputes" />}
							>
								<HugeiconsIcon icon={Scales01Icon} />
								Contradictions
							</SidebarMenuButton>
						</SidebarMenuItem>
```

Import `Scales01Icon` from `@hugeicons/core-free-icons` alongside the others, and add `"disputes"` to the `APP_ROUTES` set at the top of the file — otherwise "All Notes" lights up as active on this route.

- [ ] **Step 5: Typecheck, test, build**

```bash
cd apps/client && pnpm exec tsc --noEmit && pnpm exec vitest run
```

Expected: no type errors, all tests pass.

```bash
pnpm --filter client build
```

Expected: `✓ Compiled successfully`, and `/disputes` in the route list.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/disputes apps/client/src/app/\(app\)/disputes apps/client/src/components/sidebar/app-sidebar.tsx
git commit -m "feat(client): the contradictions page

Every claim the compiler could not reconcile, both sides with their passages and
their sources. No resolve button: closing a contradiction would ask the reader
to decide and then make the product forget the disagreement happened.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end pass on the real workspace

Nothing here is a code change. It is the gate before recording, and the five questions are fixed so the answers can be compared rather than felt.

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Restart the stack cleanly**

```bash
node scripts/dev-clean.mjs && pnpm dev
```

An older process holding 8000 will keep serving the old code while uvicorn prints its banner anyway — this has caused three false diagnoses in this repository. Confirm the new code is live before judging anything:

```bash
curl -s http://localhost:8000/openapi.json | python -c "import json,sys; print(sorted(k for k in json.load(sys.stdin)['paths'] if 'disputes' in k or 'context' in k))"
```

Expected: `['/api/v1/copilot/context', '/api/v1/disputes']`

- [ ] **Step 2: Ask the five questions**

Signed in at `http://localhost:3000/agent`, in this order. Read every answer.

1. "What does my workspace cover?" — expect zero retrievals and page links, no `[c1]` markers.
2. "Where do my sources disagree?" — expect the contradiction named with both quotes.
3. "Quote the exact sentence behind [pick a claim from the answer to 2]" — expect exactly one retrieval and a `[c1]` marker.
4. "What does my workspace say about [something it certainly has not compiled]?" — expect a refusal that names what is missing, not an invented answer.
5. A follow-up to question 2 with no subject ("and which source is older?") — expect it to answer from the briefing without searching again.

- [ ] **Step 3: Check the ledger**

Open `/disputes`. Confirm: both sides appear with their quotes and dates, the page link resolves, and **Ask the copilot** lands on `/agent` with the question prefilled.

- [ ] **Step 4: Record what you saw**

Write the five answers and the retrieval counts into the pull request or the commit body. If any answer refuses something the briefing plainly contains, stop — that is the prompt regression this task exists to catch, and it is fixed by tightening rule 6, not by shipping.

- [ ] **Step 5: Commit anything the pass changed**

Only if a fix was needed:

```bash
git add -A
git commit -m "fix(agent): <what the five-question pass caught>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Reserved slug → Task 1. Budget and truncation honesty → Task 2. Dispute reading with the current-revision filter → Task 3. `/api/v1/disputes` → Task 4. `/api/v1/copilot/context` and its contents → Task 5. Pack injected per turn, never persisted, degrading on failure → Task 6. Rule one inverted, two-tier citations, sharpened refusal → Task 7. The visible proof → Task 8. "Ask the copilot" → Tasks 9–10. The five-question pass → Task 11. Out-of-scope items appear nowhere.

**Types.** `PageBrief`/`ThemeBrief`/`Pack`/`assemble` (Task 2) are consumed under those names in Task 5. `DisputeView`/`DisputeSide` (Task 3) are consumed in Tasks 4 and 5. `DisputeOut`/`DisputeSideOut` are declared once in Task 3 and reused in Tasks 4 and 5. `ContextPack`/`fetchContextPack`/`renderContextPack` (Task 6) are used in the same task. `questionFor` (Task 9) is consumed in Task 10 with the same signature. `retrievalCount` is named identically in Task 8's test, interface and view.

**Known soft spot, stated rather than hidden.** Task 8's stored-metadata path cannot recover a retrieval count for a conversation reloaded from the API — the count is not persisted. It reports 0, which is right for the common case and wrong for a reloaded answer that did search. Persisting it would mean a schema change, which this plan does not take on five days out. If the video shows a reloaded thread, use a live one instead.
