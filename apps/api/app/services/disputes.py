"""Claims the compiler could not reconcile.

A dispute is the one thing this product has that a summariser does not: two
sources saying incompatible things, both kept, each with the passage it came
from. Deciding between them is the reader's job, and the compiler declining to
do it quietly is the feature rather than a limitation.

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
            # Contradicting side first: the reader already knows what the page
            # says, and the surprise is what argues against it.
            sides=sorted(
                by_claim.get(claim.id, []),
                key=lambda side: side.stance != "contradicts",
            ),
        )
        for claim, page in rows
    ]
