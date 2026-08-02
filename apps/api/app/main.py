"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import dispose_engine
from .embeddings import EmbeddingError, resolve_provider
from .events import close_redis
from .queue import close_pool
from .routers import chat, copilot, graph, internal, items, pages, runs

log = structlog.get_logger(__name__)


def configure_logging(level: str) -> None:
    logging.basicConfig(format="%(message)s", level=getattr(logging, level.upper(), logging.INFO))
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="%H:%M:%S"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)

    log.info(
        "starting",
        database=settings.sqlalchemy_url.split("@")[-1],
        chat_model=settings.bedrock_model,
        region=settings.resolved_region,
    )

    if settings.internal_token_is_default:
        # The /internal/* endpoints write to the knowledge base without going
        # through capture, and this is the only thing standing in front of them.
        # The default is published in the repository, so on anything reachable
        # beyond localhost they are effectively unauthenticated. Said at warning
        # level with the fix inline, because a secret nobody was told to set is
        # one nobody sets.
        log.warning(
            "internal_token_is_default",
            detail=(
                "agent→API endpoints are protected by the published dev token. "
                "Set INTERNAL_API_TOKEN in .env before exposing this API: "
                'python -c "import secrets; print(secrets.token_urlsafe(32))"'
            ),
        )

    # Probe embedding providers once at startup rather than discovering a bad
    # region on the first save. Whichever wins is logged and recorded per row.
    try:
        app.state.embedder = await resolve_provider(settings)
    except EmbeddingError as exc:
        # Serving without embeddings would silently reduce topic matching to
        # title comparison, so this is loud — but the process still starts so the
        # read-only surfaces and the error itself remain visible.
        app.state.embedder = None
        log.error("embeddings_unavailable", error=str(exc))

    yield

    await close_pool()
    await close_redis()
    await dispose_engine()


app = FastAPI(
    title="Knowledge Compiler API",
    description=(
        "Capture, compile, and serve a personal knowledge base. "
        "Compilation itself runs in the Mastra agent service; this API owns "
        "storage, embeddings, and the live activity feed."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    # The extension's origin is chrome-extension://<generated id>, which is not
    # known until it is loaded, so it is matched by pattern instead of listed.
    allow_origin_regex=r"^(chrome|moz)-extension://[a-zA-Z0-9\-]+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(items.router)
app.include_router(pages.router)
app.include_router(graph.router)
app.include_router(runs.router)
app.include_router(copilot.router)
app.include_router(internal.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, object]:
    """Liveness plus the two facts most worth knowing when something is wrong."""
    from .services.matching import resolve_threshold

    embedder = getattr(app.state, "embedder", None)
    return {
        "status": "ok",
        "embeddingProvider": embedder.name if embedder else None,
        "matchThreshold": resolve_threshold(embedder.suggested_threshold) if embedder else None,
        "chatModel": _settings.bedrock_model,
    }


def main() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
