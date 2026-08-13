"""Copilot retrieval.

Deliberately mounted under `/api/v1`, not `/internal`, and authenticated with the
*user's* token rather than the shared service token.

The compile pipeline uses `/internal` because its caller is the worker, and the
workspace has to be derived from a stored run. The copilot's caller is a person,
so their own token already names the workspace — and taking it from there means
the agent never sends a workspace id at all. There is nothing to tamper with.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..config import get_settings
from ..deps import DbDep, EmbedderDep, ScopeDep
from ..ratelimit import check_hourly
from ..schemas import CopilotSearchResponse, RetrievedClaimOut, ThemeOut
from ..services.communities import overview
from ..services.retrieval import DEFAULT_LIMIT, search_claims

router = APIRouter(prefix="/api/v1/copilot", tags=["copilot"])

#: How many themes travel with an answer.
#:
#: A ceiling rather than the whole map: the themes are orientation, and a
#: workspace with forty of them would spend most of the prompt on the map
#: instead of on the claims the answer has to rest on.
MAX_THEMES = 8


@router.get("/search", response_model=CopilotSearchResponse)
async def search(
    db: DbDep,
    scope: ScopeDep,
    embedder: EmbedderDep,
    q: str = Query(..., min_length=2, description="The reader's question"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=30),
) -> CopilotSearchResponse:
    """Claims from this workspace relevant to a question.

    Returns claims rather than page prose because a claim already carries its
    verbatim source quote — which is what lets an answer be checked rather than
    trusted.
    """
    await check_hourly(scope, name="ask", limit=get_settings().ask_rate_limit_per_hour)

    embedding: list[float] | None = None
    try:
        embedding = (await embedder.embed([q]))[0]
    except Exception:
        # Lexical search alone still answers exact-identifier questions, so an
        # embedding outage degrades the copilot rather than disabling it.
        embedding = None

    claims = await search_claims(
        db, scope=scope, query=q, embedding=embedding, limit=limit
    )

    # Sent with every answer, not only when retrieval comes back empty. A
    # question about a specific fact still benefits from knowing what else the
    # workspace holds — it is what lets an answer say which neighbouring area
    # covers the part the claims do not.
    themes = [
        ThemeOut(
            title=view.title,
            summary=view.summary,
            node_count=view.node_count,
            page_count=view.page_count,
        )
        for view in await overview(db, scope)
        if view.title and view.summary
    ][:MAX_THEMES]

    return CopilotSearchResponse(
        query=q,
        semantic=embedding is not None,
        themes=themes,
        claims=[
            RetrievedClaimOut(
                claim_id=c.claim_id,
                text=c.text,
                section=c.section,
                status=c.status,
                page_slug=c.page_slug,
                page_title=c.page_title,
                quote=c.quote,
                source_title=c.source_title,
                source_url=c.source_url,
            )
            for c in claims
        ],
    )
