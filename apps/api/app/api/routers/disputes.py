"""The workspace's open contradictions.

A page shows the disputes on it. This answers the other question — what does my
library disagree with itself about — which no single page can.
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
