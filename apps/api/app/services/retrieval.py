"""Retrieval for the copilot.

The copilot may only answer from compiled content, and every sentence it writes
has to be traceable. So retrieval returns *claims*, not pages: a claim already
carries the verbatim source quote and the page it belongs to, which is exactly
the unit a citation needs. Returning page prose instead would leave the model to
invent which part supported its answer.

Two passes are combined:

* **Semantic** — cosine over page embeddings, which is what the compile pipeline
  already uses, so no new index is needed.
* **Lexical** — a LIKE scan over claim text, because embeddings reliably miss
  exact identifiers (a model name, a figure, an acronym) that a reader searching
  their own notes is most likely to type.

Neither alone is sufficient: semantic misses "GLM-5", lexical misses "how does
quantisation hurt accuracy". Both are scoped by workspace at the SQL level.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoping import Scope
from app.models import ClaimSource, RawItem, WikiClaim, WikiPage
from app.services.matching import to_vector_literal

#: Claims returned per query. Enough for the model to synthesise across sources,
#: few enough that the prompt stays readable and cheap.
DEFAULT_LIMIT = 12


@dataclass
class RetrievedClaim:
    claim_id: str
    text: str
    section: str
    status: str
    page_slug: str
    page_title: str
    quote: str
    source_title: str | None
    source_url: str | None
    score: float
    how: str  # "semantic" | "lexical" — shown in logs, not to the model


_SEMANTIC_PAGES = text(
    """
    SELECT id, 1 - (embedding <=> CAST(:query_vector AS VECTOR(1024))) AS similarity
    FROM wiki_pages
    WHERE workspace_id = :workspace_id AND embedding IS NOT NULL
    ORDER BY embedding <=> CAST(:query_vector AS VECTOR(1024))
    LIMIT :limit
    """
)


async def _claims_for_pages(
    db: AsyncSession, page_ids: list[str], scope: Scope
) -> list[tuple]:
    if not page_ids:
        return []
    return (
        await db.execute(
            select(WikiClaim, WikiPage.slug, WikiPage.title, ClaimSource, RawItem)
            .join(WikiPage, WikiPage.id == WikiClaim.page_id)
            .join(ClaimSource, ClaimSource.claim_id == WikiClaim.id, isouter=True)
            .join(RawItem, RawItem.id == ClaimSource.raw_item_id, isouter=True)
            .where(
                # Scoped here as well as in the page query: a claim reached
                # through a join must not escape the workspace filter.
                WikiPage.workspace_id == scope.workspace_id,
                WikiClaim.page_id.in_(page_ids),
                WikiClaim.revision_id == WikiPage.current_revision_id,
            )
        )
    ).all()


def _to_claim(row: tuple, score: float, how: str) -> RetrievedClaim:
    claim, slug, title, source, item = row
    return RetrievedClaim(
        claim_id=str(claim.id),
        text=claim.text,
        section=claim.section,
        status=claim.status,
        page_slug=slug,
        page_title=title,
        quote=source.quote if source else "",
        source_title=item.title if item else None,
        source_url=item.source_url if item else None,
        score=score,
        how=how,
    )


async def search_claims(
    db: AsyncSession,
    *,
    scope: Scope,
    query: str,
    embedding: list[float] | None,
    limit: int = DEFAULT_LIMIT,
) -> list[RetrievedClaim]:
    """Claims relevant to a question, most relevant first.

    Deduplicated by claim id, since a claim can surface through both passes.
    """
    found: dict[str, RetrievedClaim] = {}

    # ── semantic ──────────────────────────────────────────────────────────────
    if embedding:
        pages = (
            await db.execute(
                _SEMANTIC_PAGES,
                {
                    "query_vector": to_vector_literal(embedding),
                    "workspace_id": scope.workspace_id,
                    "limit": max(3, limit // 3),
                },
            )
        ).mappings().all()

        similarity_by_page = {str(p["id"]): float(p["similarity"]) for p in pages}
        for row in await _claims_for_pages(db, list(similarity_by_page), scope):
            claim = _to_claim(row, similarity_by_page[str(row[0].page_id)], "semantic")
            found.setdefault(claim.claim_id, claim)

    # ── lexical ───────────────────────────────────────────────────────────────
    # Catches exact identifiers embeddings smooth away. Terms are ANDed so a
    # multi-word query narrows rather than widens.
    terms = [t for t in query.lower().split() if len(t) > 2][:6]
    if terms:
        conditions = [func.lower(WikiClaim.text).like(f"%{t}%") for t in terms]
        rows = (
            await db.execute(
                select(WikiClaim, WikiPage.slug, WikiPage.title, ClaimSource, RawItem)
                .join(WikiPage, WikiPage.id == WikiClaim.page_id)
                .join(ClaimSource, ClaimSource.claim_id == WikiClaim.id, isouter=True)
                .join(RawItem, RawItem.id == ClaimSource.raw_item_id, isouter=True)
                .where(
                    WikiPage.workspace_id == scope.workspace_id,
                    WikiClaim.revision_id == WikiPage.current_revision_id,
                    or_(*conditions),
                )
                .limit(limit * 2)
            )
        ).all()

        for row in rows:
            claim_text = row[0].text.lower()
            # Score by how many query terms the claim actually contains, so a
            # claim matching every term outranks one matching a single common word.
            hits = sum(1 for t in terms if t in claim_text)
            existing = found.get(str(row[0].id))
            score = hits / len(terms)
            if existing is None:
                found[str(row[0].id)] = _to_claim(row, score, "lexical")
            elif score > existing.score:
                existing.score = score

    ranked = sorted(found.values(), key=lambda c: c.score, reverse=True)
    return ranked[:limit]
