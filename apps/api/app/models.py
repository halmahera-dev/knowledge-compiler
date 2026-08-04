"""SQLAlchemy models mirroring prisma/schema.prisma.

Prisma owns the schema; this module owns runtime access. When the two drift,
schema.prisma wins — regenerate the migration there and update these to match.

Embedding columns are declared as ``Vector``, a thin custom type: CockroachDB's
native ``VECTOR`` has no SQLAlchemy dialect support, and neither Prisma nor
SQLAlchemy can round-trip it, so it is rendered as text on the way in and parsed
on the way out. That is fine because vectors are only ever written whole and read
back for display; similarity comparisons happen in SQL via the ``<=>`` operator.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    cast,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType

from .config import DB_SCHEMA, EMBEDDING_DIM


class Base(DeclarativeBase):
    metadata_schema = DB_SCHEMA


Base.metadata.schema = DB_SCHEMA


class Vector(UserDefinedType[list[float]]):
    """CockroachDB's native ``VECTOR(n)``.

    Neither asyncpg nor SQLAlchemy has a codec for this type, so values travel as
    the pgvector-compatible literal ``'[0.1,0.2,...]'`` that CockroachDB parses.

    The ``bind_expression`` cast is required, not cosmetic: without it the driver
    sends the literal as ``varchar`` and CockroachDB refuses the insert with
    "value type varchar doesn't match type vector" rather than coercing it.
    """

    cache_ok = True

    def __init__(self, dim: int = EMBEDDING_DIM) -> None:
        self.dim = dim

    def get_col_spec(self, **_: Any) -> str:
        return f"VECTOR({self.dim})"

    def bind_processor(self, _dialect: Any):
        def process(value: list[float] | None) -> str | None:
            if value is None:
                return None
            if len(value) != self.dim:
                raise ValueError(f"expected {self.dim}-dim embedding, got {len(value)}")
            return "[" + ",".join(repr(float(x)) for x in value) + "]"

        return process

    def bind_expression(self, bindvalue: Any) -> Any:
        return cast(bindvalue, self)

    def result_processor(self, _dialect: Any, _coltype: Any):
        def process(value: Any) -> list[float] | None:
            if value is None:
                return None
            if isinstance(value, list):
                return [float(x) for x in value]
            return [float(part) for part in str(value).strip("[]").split(",") if part]

        return process


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _now() -> Mapped[dt.datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# Enum names must match the Postgres types Prisma created. `create_type=False`
# stops SQLAlchemy trying to re-create them.
def _enum(*values: str, name: str) -> Enum:
    return Enum(*values, name=name, schema=DB_SCHEMA, create_type=False, native_enum=True)


class Wiki(Base):
    """A wiki inside a workspace.

    A workspace holds many wikis but exactly ONE graph — concept nodes and edges
    are keyed on workspace, not wiki, so an edge can join a page in one wiki to a
    page in another. That crossing is the product, not an accident.
    """

    __tablename__ = "wikis"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="wikis_workspace_slug_key"),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    #: A Better Auth organization id. Deliberately no foreign key: organizations
    #: live in the `auth` schema, owned and migrated by a different service.
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_at: Mapped[dt.datetime] = _now()
    updated_at: Mapped[dt.datetime] = _now()


# ─── capture ─────────────────────────────────────────────────────────────────


class RawItem(Base):
    """One row per save, whichever of the three capture modes produced it."""

    __tablename__ = "raw_items"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "content_hash", name="raw_items_workspace_content_hash_key"
        ),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    wiki_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wikis.id", ondelete="CASCADE")
    )
    #: Who saved it, for attribution. Scoping is by workspace, never by this.
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    capture_type: Mapped[str] = mapped_column(
        _enum("paste", "clip", "link", "pdf", name="capture_type"), nullable=False
    )
    source_url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    #: sha256 of normalized content — makes re-saving the same article a no-op
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    embedding_model: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        _enum("pending", "processing", "compiled", "failed", name="item_status"),
        nullable=False,
        server_default="pending",
    )
    created_at: Mapped[dt.datetime] = _now()


# ─── wiki ────────────────────────────────────────────────────────────────────


class WikiPage(Base):
    __tablename__ = "wiki_pages"
    __table_args__ = (
        UniqueConstraint("wiki_id", "slug", name="wiki_pages_wiki_slug_key"),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    wiki_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wikis.id", ondelete="CASCADE")
    )
    slug: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    embedding: Mapped[list[float] | None] = mapped_column(Vector())
    embedding_model: Mapped[str | None] = mapped_column(Text)
    #: Deliberately not a FK — WikiPage and WikiPageRevision reference each other.
    current_revision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[dt.datetime] = _now()
    updated_at: Mapped[dt.datetime] = _now()

    revisions: Mapped[list[WikiPageRevision]] = relationship(
        back_populates="page", cascade="all, delete-orphan", lazy="selectin"
    )


class WikiPageRevision(Base):
    """Every compile writes a new revision instead of mutating the page.

    That is what makes history browsing and undo possible.
    """

    __tablename__ = "wiki_page_revisions"
    __table_args__ = (
        UniqueConstraint("page_id", "revision_no", name="wiki_page_revisions_page_no_key"),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wiki_pages.id", ondelete="CASCADE")
    )
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    #: ordered sections: [{heading, body}]
    body: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    #: the CompileDiff that produced this revision, replayed in the activity feed
    diff: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    compile_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[dt.datetime] = _now()

    page: Mapped[WikiPage] = relationship(back_populates="revisions")


class WikiClaim(Base):
    """Claims are scoped to a revision, so reverting restores the exact claim set."""

    __tablename__ = "wiki_claims"
    __table_args__ = (
        Index("wiki_claims_revision_idx", "revision_id", "position"),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wiki_pages.id", ondelete="CASCADE")
    )
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wiki_page_revisions.id", ondelete="CASCADE")
    )
    section: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        _enum("asserted", "disputed", "superseded", name="claim_status"),
        nullable=False,
        server_default="asserted",
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.5")
    created_at: Mapped[dt.datetime] = _now()

    sources: Mapped[list[ClaimSource]] = relationship(
        back_populates="claim", cascade="all, delete-orphan", lazy="selectin"
    )


class ClaimSource(Base):
    """The verbatim span of a source that produced a claim.

    This is what lets the wiki show where a sentence came from instead of asking
    the reader to trust the model.
    """

    __tablename__ = "claim_sources"
    __table_args__ = ({"schema": DB_SCHEMA},)

    id: Mapped[uuid.UUID] = _uuid_pk()
    claim_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wiki_claims.id", ondelete="CASCADE")
    )
    raw_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.raw_items.id", ondelete="CASCADE")
    )
    quote: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    char_start: Mapped[int | None] = mapped_column(Integer)
    char_end: Mapped[int | None] = mapped_column(Integer)
    stance: Mapped[str] = mapped_column(
        _enum("supports", "contradicts", name="source_stance"),
        nullable=False,
        server_default="supports",
    )

    claim: Mapped[WikiClaim] = relationship(back_populates="sources")


class WikiPageSource(Base):
    """Page-level bibliography, rendered in the marginalia rail."""

    __tablename__ = "wiki_page_sources"
    __table_args__ = ({"schema": DB_SCHEMA},)

    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{DB_SCHEMA}.wiki_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    raw_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{DB_SCHEMA}.raw_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    first_seen_at: Mapped[dt.datetime] = _now()


# ─── graph ───────────────────────────────────────────────────────────────────


class GraphNode(Base):
    __tablename__ = "graph_nodes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "label", name="graph_nodes_workspace_label_key"),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    wiki_page_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.wiki_pages.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(
        _enum("topic", "entity", name="node_kind"), nullable=False, server_default="topic"
    )
    #: how much saved content touches this topic; drives node radius (PRD §6.4)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[dt.datetime] = _now()
    updated_at: Mapped[dt.datetime] = _now()


class GraphEdge(Base):
    __tablename__ = "graph_edges"
    __table_args__ = (
        UniqueConstraint(
            "source_node_id", "target_node_id", "relation", name="graph_edges_triple_key"
        ),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.graph_nodes.id", ondelete="CASCADE")
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.graph_nodes.id", ondelete="CASCADE")
    )
    relation: Mapped[str] = mapped_column(
        _enum(
            "extends",
            "contradicts",
            "prerequisite_of",
            "example_of",
            "related_to",
            name="edge_relation",
        ),
        nullable=False,
        server_default="related_to",
    )
    weight: Mapped[float] = mapped_column(Float, nullable=False, server_default="1.0")
    evidence_raw_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.raw_items.id", ondelete="SET NULL")
    )
    #: Undo withdraws everything a run created, so edges remember their author run
    #: and are soft-deleted rather than removed.
    created_by_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    withdrawn_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = _now()


# ─── agent runs ──────────────────────────────────────────────────────────────


class CompileRun(Base):
    __tablename__ = "compile_runs"
    __table_args__ = ({"schema": DB_SCHEMA},)

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    raw_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.raw_items.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(
        _enum("queued", "running", "succeeded", "failed", name="run_status"),
        nullable=False,
        server_default="queued",
    )
    mastra_run_id: Mapped[str | None] = mapped_column(Text)
    #: the structured CompileDiff surfaced in the activity feed
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    #: raw model output kept when a step fails schema validation, so a bad compile
    #: is diagnosable instead of just "failed"
    raw_output: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = _now()


class KnowledgeGap(Base):
    """"You've read a lot about X but never its prerequisite Y." """

    __tablename__ = "knowledge_gaps"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "question", name="knowledge_gaps_workspace_question_key"
        ),
        {"schema": DB_SCHEMA},
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{DB_SCHEMA}.graph_nodes.id", ondelete="CASCADE")
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    status: Mapped[str] = mapped_column(
        _enum("open", "dismissed", "filled", name="gap_status"),
        nullable=False,
        server_default="open",
    )
    created_at: Mapped[dt.datetime] = _now()


__all__ = [
    "Base",
    "ClaimSource",
    "CompileRun",
    "GraphEdge",
    "GraphNode",
    "KnowledgeGap",
    "RawItem",
    "Wiki",
    "Vector",
    "WikiClaim",
    "WikiPage",
    "WikiPageRevision",
    "WikiPageSource",
]


class ChatSession(Base):
    """One thread of questions against a workspace's compiled knowledge.

    Scoped to a workspace rather than to a user: what is being asked about is the
    workspace's wiki, so a session belongs where its evidence does.
    """

    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False, server_default="New conversation")
    created_at: Mapped[dt.datetime] = _now()
    updated_at: Mapped[dt.datetime] = _now()

    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """A single turn. Questions and answers share a table so ordering is one column."""

    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(_enum("user", "assistant", name="chat_role"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    #: Claims the answer cited, denormalised so a thread renders without
    #: re-running retrieval.
    citations: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    #: Everything retrieval surfaced, cited or not — "12 consulted, 6 cited" is
    #: what makes an answer auditable.
    claims: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    refused: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[dt.datetime] = _now()

    session: Mapped[ChatSession] = relationship(back_populates="messages")


class AiUsageEvent(Base):
    """One model call, and what it cost.

    Recorded for every call the product makes, because "an agent works out where
    this belongs" is a sentence with a bill attached, and until it is written
    down nobody can say which part of the product is expensive.

    No foreign keys, deliberately — see the note in schema.prisma. A cost is a
    fact about money that already left; deleting the capture it came from must
    not erase the record.
    """

    __tablename__ = "ai_usage_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workspace_id: Mapped[str] = mapped_column(Text, nullable=False)

    #: `agent` or `api`.
    service: Mapped[str] = mapped_column(Text, nullable=False)
    #: extract | match | compile | link | copilot | embedding
    operation: Mapped[str] = mapped_column(Text, nullable=False)

    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)

    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)

    #: True when counts were derived from text length rather than reported.
    tokens_estimated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    #: Null when the model has no configured rate — distinct from zero, which
    #: would claim the call was free.
    estimated_usd: Mapped[Decimal | None] = mapped_column(Numeric(14, 10))

    latency_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="ok")
    error: Mapped[str | None] = mapped_column(Text)

    compile_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    chat_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    raw_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    created_at: Mapped[dt.datetime] = _now()

    # No __table_args__: schema.prisma owns the indexes, as it does for every
    # other model here, and Base.metadata.schema already puts this in `kc`.
