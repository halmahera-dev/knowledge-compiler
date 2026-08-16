"""Pydantic request/response models.

Mirrors `packages/contracts/src/index.ts`, which is the same contract expressed
in zod for the web app and the Mastra agent. Field names are camelCase on the
wire so the TypeScript side needs no mapping layer.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CaptureType = Literal["paste", "clip", "link", "pdf"]
ClaimStatus = Literal["asserted", "disputed", "superseded"]
RunStatus = Literal["queued", "running", "succeeded", "failed"]
CompileAction = Literal["create", "merge", "addendum"]
EdgeRelation = Literal["extends", "contradicts", "prerequisite_of", "example_of", "related_to"]
SourceStance = Literal["supports", "contradicts"]


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(word.capitalize() for word in rest)


class Wire(BaseModel):
    """Base for anything crossing the network: camelCase aliases, populate by name."""

    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ─── capture ─────────────────────────────────────────────────────────────────


class CreateItemRequest(Wire):
    #: pdf is deliberately absent: it arrives as multipart at /items/pdf, and
    #: accepting it here would create an item with no file behind it.
    capture_type: Literal["paste", "clip", "link"]
    #: Which wiki to file this under. Omitted means the workspace default.
    wiki_id: uuid.UUID | None = None
    content: str | None = None
    source_url: str | None = None
    title: str | None = None

    @model_validator(mode="after")
    def _require_payload(self) -> CreateItemRequest:
        if self.capture_type == "link":
            if not self.source_url:
                raise ValueError("link captures require sourceUrl")
        elif not (self.content and self.content.strip()):
            raise ValueError(f"{self.capture_type} captures require content")
        return self


class DuplicateOf(Wire):
    """The already-saved item a re-save collided with."""

    item_id: uuid.UUID
    title: str | None = None
    #: Set once the item has compiled into a page, so the UI can link to it.
    page_slug: str | None = None


class CreateItemResponse(Wire):
    item_id: uuid.UUID
    run_id: uuid.UUID | None
    status: RunStatus
    #: The title the server derived. Returned because the caller does not know
    #: it: `derive_title` reads the fetched page, or the first line of a paste,
    #: and a caller that guessed would name the save something other than what
    #: the library will show. The copilot reports this back verbatim.
    title: str | None = None
    #: True when this content was already saved; nothing was queued.
    duplicate: bool = False
    #: What it matched. Present only on a duplicate, so the reader can check the
    #: refusal instead of taking it on faith.
    duplicate_of: DuplicateOf | None = None
    #: How many compiles a long document was split into. 1 for a normal save.
    parts_queued: int = 1


class RawItemOut(Wire):
    """An item as shown in the browser — excerpt only, never the full body."""

    id: uuid.UUID
    capture_type: CaptureType
    source_url: str | None
    title: str | None
    status: str
    created_at: dt.datetime
    excerpt: str = ""


class RawItemContent(Wire):
    """An item as the compile pipeline sees it: the whole document.

    Deliberately a separate shape from `RawItemOut` so a UI endpoint can never
    start returning a 200KB body by accident, and so the agent can never be fed
    a truncated one.
    """

    id: uuid.UUID
    capture_type: CaptureType
    source_url: str | None
    title: str | None
    content: str
    created_at: dt.datetime


# ─── wiki ────────────────────────────────────────────────────────────────────


class ClaimSourceOut(Wire):
    raw_item_id: uuid.UUID
    quote: str
    stance: SourceStance
    source_url: str | None = None
    source_title: str | None = None


class ClaimOut(Wire):
    id: uuid.UUID
    section: str
    position: int
    text: str
    status: ClaimStatus
    confidence: float
    sources: list[ClaimSourceOut] = Field(default_factory=list)


class SectionOut(Wire):
    heading: str
    body: str


class PageSummaryOut(Wire):
    id: uuid.UUID
    slug: str
    title: str
    summary: str
    updated_at: dt.datetime
    source_count: int = 0
    claim_count: int = 0
    disputed_count: int = 0


class RevisionMetaOut(Wire):
    id: uuid.UUID
    revision_no: int
    created_at: dt.datetime
    action: str | None = None


class PageDetailOut(Wire):
    id: uuid.UUID
    slug: str
    title: str
    summary: str
    created_at: dt.datetime
    updated_at: dt.datetime
    revision_no: int
    sections: list[SectionOut] = Field(default_factory=list)
    claims: list[ClaimOut] = Field(default_factory=list)
    sources: list[RawItemOut] = Field(default_factory=list)
    #: Pages one hop away in the graph — the "see also" rail.
    backlinks: list[PageSummaryOut] = Field(default_factory=list)
    revisions: list[RevisionMetaOut] = Field(default_factory=list)


class RevertRequest(Wire):
    revision_no: int


class DisputeSideOut(Wire):
    stance: SourceStance
    quote: str
    source_title: str | None = None
    source_url: str | None = None
    saved_at: dt.datetime


class DisputeOut(Wire):
    """A claim two sources disagree about, with both passages.

    Both sides travel together, always. A dispute rendered as one side plus a
    warning badge is a summary that picked a winner and then apologised for it.
    """

    claim_id: uuid.UUID
    text: str
    section: str
    page_slug: str
    page_title: str
    sides: list[DisputeSideOut] = Field(default_factory=list)


# ─── graph ───────────────────────────────────────────────────────────────────


class GraphNodeOut(Wire):
    id: uuid.UUID
    label: str
    kind: Literal["topic", "entity"]
    weight: int
    slug: str | None = None
    #: Which cluster Louvain put it in. Null before the first detection run.
    #: A colour index, not an identity — the numbers are reassigned each run.
    community: int | None = None


class GraphEdgeOut(Wire):
    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID
    relation: EdgeRelation
    weight: float


class DerivedEdgeOut(Wire):
    """An edge computed from where nodes were seen, not asserted by the agent.

    Returned separately from `edges` rather than merged into it. A typed relation
    is a claim that can be wrong, which is why a compile can be reverted;
    co-occurrence is a statistic that cannot be wrong, only uninteresting.
    Merging them would leave a boolean column as the only thing keeping a
    statistic from reading as a judgement.
    """

    source: uuid.UUID
    target: uuid.UUID
    #: `mentions` — a concept and the page it was found on.
    #: `co_occurs` — two concepts that keep appearing in the same captures.
    kind: Literal["mentions", "co_occurs"]
    #: How many captures support it, which is also how it explains itself.
    shared_sources: int


class GraphOut(Wire):
    nodes: list[GraphNodeOut] = Field(default_factory=list)
    edges: list[GraphEdgeOut] = Field(default_factory=list)
    derived_edges: list[DerivedEdgeOut] = Field(default_factory=list)


class CommunityOut(Wire):
    """A cluster of the graph, named.

    `community` is the colour index the nodes currently carry, so it lines up
    with `GraphNodeOut.community` in the same response. It is not an identity:
    detection renumbers, and the number means nothing between runs. What is
    durable is the membership, which is why the summary is stored against a hash
    of it and never against this.
    """

    community: int
    #: Null until the agent has named it. A cluster too small to be worth a model
    #: call stays null forever, and that is the intended end state.
    title: str | None = None
    summary: str | None = None
    node_count: int
    page_count: int
    #: The heaviest concepts in it, so an unnamed cluster still says something.
    labels: list[str] = Field(default_factory=list)
    summarised_at: dt.datetime | None = None


class CommunitiesOut(Wire):
    communities: list[CommunityOut] = Field(default_factory=list)


# ─── runs / feed ─────────────────────────────────────────────────────────────


class CompileDiffPage(Wire):
    id: uuid.UUID
    slug: str
    title: str
    revision_no: int


class CompileDiffEdge(Wire):
    source: str
    target: str
    relation: EdgeRelation


class CompileDiff(Wire):
    """What the agent actually changed.

    This is the product's core differentiator — the compile step is shown, not
    hidden, so a user can see and undo exactly what happened on every save.
    """

    run_id: uuid.UUID
    raw_item_id: uuid.UUID
    action: CompileAction
    page: CompileDiffPage
    claims_added: int = 0
    claims_disputed: int = 0
    sections_added: list[str] = Field(default_factory=list)
    nodes_created: list[str] = Field(default_factory=list)
    edges_created: list[CompileDiffEdge] = Field(default_factory=list)
    gaps_raised: list[str] = Field(default_factory=list)
    reasoning: str = ""


class RunOut(Wire):
    id: uuid.UUID
    raw_item_id: uuid.UUID
    status: RunStatus
    diff: dict[str, Any] | None = None
    error: str | None = None
    created_at: dt.datetime
    finished_at: dt.datetime | None = None
    item_title: str | None = None
    source_url: str | None = None


class GapOut(Wire):
    id: uuid.UUID
    question: str
    reason: str
    status: Literal["open", "dismissed", "filled"]
    created_at: dt.datetime
    node_label: str | None = None
    node_slug: str | None = None


# ─── internal: agent callback tools ──────────────────────────────────────────


class EmbedRequest(Wire):
    texts: Annotated[list[str], Field(min_length=1, max_length=32)]


class EmbedResponse(Wire):
    model: str
    vectors: list[list[float]]


class MatchRequest(Wire):
    #: The run this match belongs to. The API derives the workspace from it
    #: rather than accepting one, so the agent cannot search another tenant.
    run_id: uuid.UUID
    text: str
    top_k: int = 5


class PendingCommunitiesRequest(Wire):
    #: As everywhere under /internal: the workspace comes from the run, never
    #: from the body, so the agent cannot read another tenant's clusters.
    run_id: uuid.UUID
    #: How many to name in this compile. Capped by the API regardless of what is
    #: asked for — an uncapped value is an unbounded number of model calls
    #: hanging off a single save.
    limit: int = 3


class CommunityMaterialOut(Wire):
    """What the agent is given to write a cluster's summary from."""

    fingerprint: str
    community: int
    node_count: int
    page_count: int
    labels: list[str] = Field(default_factory=list)
    #: Compiled pages in this cluster, as (title, summary). The better evidence:
    #: labels say what the cluster is about, pages say what it established.
    pages: list[tuple[str, str]] = Field(default_factory=list)


class PendingCommunitiesResponse(Wire):
    communities: list[CommunityMaterialOut] = Field(default_factory=list)


class CommunitySummaryRequest(Wire):
    run_id: uuid.UUID
    #: Addressed by membership, not by number. A summary filed under a number
    #: would describe a different cluster after the next detection run.
    fingerprint: str
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1200)


class PageCandidate(Wire):
    page_id: uuid.UUID
    slug: str
    title: str
    summary: str
    similarity: float


class MatchResponse(Wire):
    candidates: list[PageCandidate] = Field(default_factory=list)
    threshold: float


class ExistingClaim(Wire):
    id: uuid.UUID
    text: str
    section: str
    status: ClaimStatus


class PageClaimsResponse(Wire):
    page_id: uuid.UUID
    title: str
    summary: str
    sections: list[SectionOut] = Field(default_factory=list)
    claims: list[ExistingClaim] = Field(default_factory=list)


class ApplyClaim(Wire):
    text: str
    quote: str = ""
    section: str = ""
    confidence: float = 0.5
    status: ClaimStatus = "asserted"
    contradicts_claim_id: uuid.UUID | None = None


class ApplyEdge(Wire):
    source: str
    target: str
    relation: EdgeRelation = "related_to"
    weight: float = 1.0


class ApplyGap(Wire):
    question: str
    reason: str = ""
    related_to: str = ""


class ApplyCompileRequest(Wire):
    """The single write the agent makes, applied in one transaction."""

    run_id: uuid.UUID
    raw_item_id: uuid.UUID
    action: CompileAction
    target_page_id: uuid.UUID | None = None
    title: str
    slug: str
    summary: str
    sections: list[SectionOut] = Field(default_factory=list)
    claims: list[ApplyClaim] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)
    edges: list[ApplyEdge] = Field(default_factory=list)
    gaps: list[ApplyGap] = Field(default_factory=list)
    reasoning: str = ""


class RunFailedRequest(Wire):
    run_id: uuid.UUID
    error: str
    raw_output: str | None = None


class RunStepRequest(Wire):
    run_id: uuid.UUID
    step: Literal["extract", "match", "compile", "link", "persist"]
    detail: str = ""


# ─── copilot ─────────────────────────────────────────────────────────────────


class RetrievedClaimOut(Wire):
    """A citable claim.

    Carries the verbatim source quote, so an answer built on it can be checked
    rather than trusted — which is the whole reason the copilot retrieves claims
    instead of page prose.
    """

    claim_id: str
    text: str
    section: str
    status: ClaimStatus
    page_slug: str
    page_title: str
    quote: str
    source_title: str | None = None
    source_url: str | None = None


class ThemeOut(Wire):
    """A named cluster of the workspace, as orientation for an answer.

    Not evidence. A claim carries a verbatim source quote and can be checked; a
    theme is prose the agent wrote about a group of pages. It tells the copilot
    what areas this workspace covers — which is what makes "what have I been
    reading about?" answerable at all — and must never be cited as a fact.
    """

    title: str
    summary: str
    node_count: int
    page_count: int


class CopilotSearchResponse(Wire):
    query: str
    #: False when the embedding provider was unreachable and only lexical search
    #: ran — the answer may be thinner than usual, and the UI can say so.
    semantic: bool = True
    claims: list[RetrievedClaimOut] = Field(default_factory=list)
    #: The workspace's named clusters, largest first. Independent of the query:
    #: this is the map of what is here, not a retrieval result.
    themes: list[ThemeOut] = Field(default_factory=list)


class PageBriefOut(Wire):
    slug: str
    title: str
    summary: str


class ContextPackOut(Wire):
    """Everything the copilot knows before it is asked anything.

    Compiled on the write path and merely read here. `truncation` is set only
    when pages were left out, and the agent is instructed to repeat it — an
    agent that says "your notes do not cover that" about a page which simply did
    not fit has told the reader something false in the product's own voice.
    """

    page_count: int
    claim_count: int
    source_count: int
    themes: list[ThemeOut] = Field(default_factory=list)
    pages: list[PageBriefOut] = Field(default_factory=list)
    disputes: list[DisputeOut] = Field(default_factory=list)
    truncation: str | None = None


# ─── copilot conversations ───────────────────────────────────────────────────


class CitationOut(Wire):
    claim_id: str
    page_slug: str
    page_title: str


class ChatMessageOut(Wire):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    citations: list[CitationOut] = Field(default_factory=list)
    claims: list[RetrievedClaimOut] = Field(default_factory=list)
    refused: bool = False
    created_at: dt.datetime


class ChatSessionOut(Wire):
    id: uuid.UUID
    title: str
    created_at: dt.datetime
    updated_at: dt.datetime
    #: Shown in the session list so a thread reads as a conversation rather than
    #: a row; omitted when listing many.
    message_count: int = 0


class ChatSessionDetailOut(ChatSessionOut):
    messages: list[ChatMessageOut] = Field(default_factory=list)


class RenameSessionRequest(Wire):
    """A title the reader chose, replacing the one derived from their question."""

    title: str = Field(min_length=1, max_length=120)


class CreateSessionRequest(Wire):
    #: Optional: a session created from the composer names itself from the first
    #: question instead.
    title: str | None = None


class AppendTurnRequest(Wire):
    """One completed exchange, recorded after the agent has answered.

    The question and the answer arrive together rather than as two calls: a
    question stored without its answer would render as a thread that hangs, and
    the agent already has both by the time it reports back.
    """

    question: str
    answer: str
    citations: list[CitationOut] = Field(default_factory=list)
    claims: list[RetrievedClaimOut] = Field(default_factory=list)
    refused: bool = False


# ─── AI usage ────────────────────────────────────────────────────────────────


class UsageRecordRequest(Wire):
    """One model call, reported by the agent after it returns.

    The workspace is deliberately absent as an *attribution*. It is derived from
    ``run_id`` or ``chat_session_id`` on the server, for the same reason every
    other internal endpoint does it that way: a caller that can name its own
    workspace can bill or read someone else's.

    ``workspace_id`` is the caller's own workspace, taken from its signed token,
    and is used only to refuse a mismatch. Holding a session id from another
    workspace is then not enough to file spend against it.
    """

    service: Literal["agent", "api"] = "agent"
    operation: str
    provider: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    tokens_estimated: bool = False
    latency_ms: int | None = None
    status: Literal["ok", "error"] = "ok"
    error: str | None = None
    run_id: uuid.UUID | None = None
    chat_session_id: uuid.UUID | None = None
    #: Checked against the derived workspace, never used in place of it.
    workspace_id: str | None = None

    @model_validator(mode="after")
    def _needs_an_owner(self) -> UsageRecordRequest:
        if self.run_id is None and self.chat_session_id is None:
            raise ValueError("run_id or chat_session_id is required to place the workspace")
        return self


class UsageEventOut(Wire):
    id: uuid.UUID
    service: str
    operation: str
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    tokens_estimated: bool
    #: Null when the model has no configured rate — not the same as zero.
    estimated_usd: float | None
    latency_ms: int | None
    status: str
    error: str | None
    compile_run_id: uuid.UUID | None
    chat_session_id: uuid.UUID | None
    raw_item_id: uuid.UUID | None
    created_at: dt.datetime


class UsageByOperation(Wire):
    operation: str
    calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_usd: float | None


class UsageSummary(Wire):
    calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    #: Sum over the rows that had a rate. See `unpriced_calls` for the rest.
    estimated_usd: float | None
    #: How many calls could not be priced, so the total is never read as complete.
    unpriced_calls: int
    #: How many rows carry derived rather than reported counts.
    estimated_calls: int
    by_operation: list[UsageByOperation]


class UsageListOut(Wire):
    events: list[UsageEventOut]
    summary: UsageSummary
    total: int
