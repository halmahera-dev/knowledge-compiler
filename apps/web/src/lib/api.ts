/**
 * Client for the Python API.
 *
 * Types are hand-mirrored from `packages/contracts` rather than imported so the
 * web app has no build-time coupling to the agent's zod major version.
 */

import { getApiToken } from "./auth-server";
import { serviceUrl } from "./service-url";
import { getToken } from "./token";

/**
 * Mints a token from the SSR request's own session cookie.
 *
 * Wrapped so a signed-out visitor renders the page anonymously instead of the
 * whole route throwing: the loaders already treat "no data" as a valid state.
 */
async function getSsrToken(): Promise<string | null> {
  try {
    return await getApiToken();
  } catch {
    return null;
  }
}

const BASE = serviceUrl(import.meta.env.VITE_API_URL, "http://localhost:8000");

/**
 * How an item entered the knowledge base.
 *
 * Includes `pdf` because the API returns it on items read back — leaving it out
 * made the type lie about stored data. It is excluded from the JSON create
 * payload below, since a PDF is uploaded as multipart to its own endpoint.
 */
export type CaptureType = "paste" | "clip" | "link" | "pdf";
export type ClaimStatus = "asserted" | "disputed" | "superseded";
export type CompileAction = "create" | "merge" | "addendum";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type EdgeRelation =
  | "extends"
  | "contradicts"
  | "prerequisite_of"
  | "example_of"
  | "related_to";

export interface RawItem {
  id: string;
  captureType: CaptureType;
  sourceUrl: string | null;
  title: string | null;
  status: string;
  createdAt: string;
  excerpt: string;
}

export interface ClaimSource {
  rawItemId: string;
  quote: string;
  stance: "supports" | "contradicts";
  sourceUrl: string | null;
  sourceTitle: string | null;
}

export interface Claim {
  id: string;
  section: string;
  position: number;
  text: string;
  status: ClaimStatus;
  confidence: number;
  sources: ClaimSource[];
}

export interface PageSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  updatedAt: string;
  sourceCount: number;
  claimCount: number;
  disputedCount: number;
}

export interface RevisionMeta {
  id: string;
  revisionNo: number;
  createdAt: string;
  action: string | null;
}

export interface PageDetail {
  id: string;
  slug: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  revisionNo: number;
  sections: { heading: string; body: string }[];
  claims: Claim[];
  sources: RawItem[];
  backlinks: PageSummary[];
  revisions: RevisionMeta[];
}

export interface CompileDiff {
  runId: string;
  rawItemId: string;
  action: CompileAction;
  page: { id: string; slug: string; title: string; revisionNo: number };
  claimsAdded: number;
  claimsDisputed: number;
  sectionsAdded: string[];
  nodesCreated: string[];
  edgesCreated: { source: string; target: string; relation: EdgeRelation }[];
  gapsRaised: string[];
  reasoning: string;
}

export interface Run {
  id: string;
  rawItemId: string;
  status: RunStatus;
  diff: CompileDiff | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  itemTitle: string | null;
  sourceUrl: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "topic" | "entity";
  weight: number;
  slug: string | null;
  /** Which cluster Louvain put it in. Null before the first detection run. */
  community: number | null;
}

/**
 * An edge computed from where nodes were seen, not asserted by the agent.
 *
 * Kept apart from `edges` all the way to the screen. A typed relation is a claim
 * that can be wrong — which is why a compile can be reverted. Co-occurrence is a
 * statistic that cannot be wrong, only uninteresting.
 */
export interface DerivedEdge {
  source: string;
  target: string;
  kind: "mentions" | "co_occurs";
  sharedSources: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: { id: string; source: string; target: string; relation: EdgeRelation; weight: number }[];
  derivedEdges: DerivedEdge[];
}

/**
 * A cluster of the graph, named.
 *
 * `community` matches `GraphNode.community` in the same load, so the colour on
 * the canvas and the entry in the list are the same cluster. It is a colour
 * index and nothing more — detection renumbers on every save, so it is never
 * stored against anything or used to link between requests.
 */
export interface Community {
  community: number;
  /** Null until the agent has named it, and permanently null when too small. */
  title: string | null;
  summary: string | null;
  nodeCount: number;
  pageCount: number;
  labels: string[];
  summarisedAt: string | null;
}

export interface Gap {
  id: string;
  question: string;
  reason: string;
  status: "open" | "dismissed" | "filled";
  createdAt: string;
  nodeLabel: string | null;
  nodeSlug: string | null;
}

/** One model call, and what it cost. */
export interface UsageEvent {
  id: string;
  service: string;
  operation: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** True when counts were derived from text length rather than reported. */
  tokensEstimated: boolean;
  /** Null when the model has no configured rate. Not the same as zero. */
  estimatedUsd: number | null;
  latencyMs: number | null;
  status: string;
  error: string | null;
  compileRunId: string | null;
  chatSessionId: string | null;
  rawItemId: string | null;
  createdAt: string;
}

export interface UsageByOperation {
  operation: string;
  calls: number;
  totalTokens: number;
  estimatedUsd: number | null;
}

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number | null;
  /** Calls with no configured rate, so the total is never read as complete. */
  unpricedCalls: number;
  estimatedCalls: number;
  byOperation: UsageByOperation[];
}

export interface UsageList {
  events: UsageEvent[];
  summary: UsageSummary;
  total: number;
}

export type CompileEvent =
  | { type: "run.started"; runId: string; rawItemId: string; title: string | null }
  | {
      type: "run.step";
      runId: string;
      step: "extract" | "match" | "compile" | "link" | "persist";
      detail: string;
    }
  | { type: "run.succeeded"; runId: string; diff: CompileDiff }
  | { type: "run.failed"; runId: string; error: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * The API scopes every query to the workspace inside this token, so a request
   * without one is anonymous — and with anonymous access off, that means empty.
   *
   * Both halves of the isomorphic path therefore have to authenticate. In the
   * browser the token is minted from the session cookie and cached; during SSR
   * there is no `document.cookie` to read, so a server function reads the
   * incoming request's cookie instead. Skipping the server half is what made a
   * hard reload render an empty feed while navigating to the same route from
   * inside the app showed the full history.
   */
  const token = typeof window === "undefined" ? await getSsrToken() : await getToken();

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  return unwrap<T>(response);
}

/** Shared response handling, so multipart uploads report errors identically. */
async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      // FastAPI puts a plain string here for our raised errors and an array of
      // field errors for validation failures.
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((d: { msg?: string }) => d.msg ?? "invalid value")
          .join("; ");
      }
    } catch {
      // Non-JSON error body; the status-based message stands.
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface CreateItemResult {
  itemId: string;
  runId: string | null;
  status: RunStatus;
  duplicate: boolean;
  /** What a re-save collided with, so the refusal can be checked rather than trusted. */
  duplicateOf: { itemId: string; title: string | null; pageSlug: string | null } | null;
  /** How many compiles a long document was split into. 1 for a normal save. */
  partsQueued: number;
}


// ─── copilot conversations ───────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: { claimId: string; pageSlug: string; pageTitle: string }[];
  claims: CopilotClaimWire[];
  refused: boolean;
  createdAt: string;
}

/** Mirrors the agent's claim shape; kept here so api.ts owns no agent import. */
export interface CopilotClaimWire {
  claimId: string;
  text: string;
  section: string;
  status: ClaimStatus;
  pageSlug: string;
  pageTitle: string;
  quote: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export const api = {
  createItem: (payload: {
    // PDFs go to uploadPdf — this endpoint takes JSON and has no file to read.
    captureType: Exclude<CaptureType, "pdf">;
    content?: string;
    sourceUrl?: string;
    title?: string;
  }) =>
    request<CreateItemResult>("/api/v1/items", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * Uploads a PDF for extraction and compilation.
   *
   * Sent as multipart rather than through `request`, which pins
   * `Content-Type: application/json`. The header is deliberately left unset here
   * so the browser can add the multipart boundary — setting it by hand produces
   * a body the server cannot parse.
   */
  uploadPdf: async (file: File): Promise<CreateItemResult> => {
    const token = typeof window === "undefined" ? null : await getToken();
    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${BASE}/api/v1/items/pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return unwrap<CreateItemResult>(response);
  },

  listConversations: () => request<ChatSession[]>("/api/v1/chat/sessions"),
  openConversation: (id: string) =>
    request<ChatSessionDetail>(`/api/v1/chat/sessions/${id}`),
  startConversation: () =>
    request<ChatSessionDetail>("/api/v1/chat/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  deleteConversation: (id: string) =>
    request<void>(`/api/v1/chat/sessions/${id}`, { method: "DELETE" }),
  /** Record a completed exchange; returns the thread as stored. */
  appendTurn: (
    id: string,
    turn: {
      question: string;
      answer: string;
      citations: { claimId: string; pageSlug: string; pageTitle: string }[];
      claims: CopilotClaimWire[];
      refused: boolean;
    },
  ) =>
    request<ChatSessionDetail>(`/api/v1/chat/sessions/${id}/turns`, {
      method: "POST",
      body: JSON.stringify(turn),
    }),

  listItems: () => request<RawItem[]>("/api/v1/items"),
  listPages: (q?: string) =>
    request<PageSummary[]>(`/api/v1/pages${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getPage: (slug: string) => request<PageDetail>(`/api/v1/pages/${slug}`),
  getRevision: (slug: string, revisionNo: number) =>
    request<PageDetail>(`/api/v1/pages/${slug}/revisions/${revisionNo}`),
  revertPage: (pageId: string, revisionNo: number) =>
    request<PageDetail>(`/api/v1/pages/${pageId}/revert`, {
      method: "POST",
      body: JSON.stringify({ revisionNo }),
    }),
  getGraph: () => request<GraphData>("/api/v1/graph"),
  getCommunities: () =>
    request<{ communities: Community[] }>("/api/v1/graph/communities"),
  listRuns: () => request<Run[]>("/api/v1/runs"),
  /** Re-queues a run that failed or was never picked up. */
  retryRun: (runId: string) =>
    request<Run>(`/api/v1/runs/${runId}/retry`, { method: "POST" }),
  listGaps: () => request<Gap[]>("/api/v1/gaps"),
  listUsage: (params: { days?: number; operation?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.days) query.set("days", String(params.days));
    if (params.operation) query.set("operation", params.operation);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<UsageList>(`/api/v1/ai-usage${suffix ? `?${suffix}` : ""}`);
  },
  dismissGap: (id: string) =>
    request<void>(`/api/v1/gaps/${id}/dismiss`, { method: "POST" }),
  health: () =>
    request<{
      status: string;
      embeddingProvider: string | null;
      matchThreshold: number | null;
      chatModel: string;
    }>("/health"),
};

/** Subscribes to the live compile feed. Returns an unsubscribe function. */
export function subscribeToCompileEvents(
  onEvent: (event: CompileEvent) => void,
  onError?: () => void,
  token?: string | null,
): () => void {
  // EventSource cannot set headers, so the token travels as a query parameter.
  // Acceptable here because it is short-lived and the stream is read-only; a
  // write endpoint would not get this treatment.
  const source = new EventSource(
    token ? `${BASE}/api/v1/stream?token=${encodeURIComponent(token)}` : `${BASE}/api/v1/stream`,
  );

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as CompileEvent);
    } catch {
      // A malformed frame should not tear down a working stream.
    }
  };
  source.onerror = () => onError?.();

  return () => source.close();
}
