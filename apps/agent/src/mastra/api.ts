/**
 * Typed client for the Python API's internal endpoints.
 *
 * The agent never opens a database connection — every read and write goes
 * through here. That keeps one transactional writer and means a failed agent run
 * cannot leave the knowledge base half-updated.
 *
 * These are plain functions rather than Mastra tools on purpose: the compile
 * pipeline is a fixed sequence (HLD §3.4), so the workflow decides when to call
 * them. Exposing them as tools would invite the model to reorder or skip steps.
 */
import { config } from "./config";

export interface RawItemDetail {
  id: string;
  captureType: string;
  sourceUrl: string | null;
  title: string | null;
  /** The COMPLETE document. Never an excerpt — see getRawItem. */
  content: string;
  createdAt: string;
}

export interface PageCandidate {
  pageId: string;
  slug: string;
  title: string;
  summary: string;
  similarity: number;
}

export interface MatchResult {
  candidates: PageCandidate[];
  threshold: number;
}

export interface ExistingClaim {
  id: string;
  text: string;
  section: string;
  status: "asserted" | "disputed" | "superseded";
}

export interface PageClaims {
  pageId: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  claims: ExistingClaim[];
}

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
  const response = await fetch(`${config.api.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": config.api.token,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      `${init?.method ?? "GET"} ${path} failed with ${response.status}: ${body.slice(0, 400)}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Full text of a captured item — the input the whole pipeline works from.
 *
 * Uses the internal endpoint, not `/api/v1/items/{id}`. That public route returns
 * `excerpt = content[:2000]` because it feeds the browser, and reading the
 * document from it truncated every source to its first 2000 characters — so a
 * long article was compiled from its opening paragraphs and nothing else.
 */
export async function getRawItem(itemId: string): Promise<RawItemDetail> {
  return request<RawItemDetail>(`/internal/items/${itemId}`);
}

/**
 * Which existing pages is this text closest to, and what counts as "close"?
 *
 * The run id is required: the API derives the workspace from it rather than
 * accepting one, so this call cannot reach across tenants even if the agent asks.
 */
export async function searchSimilarPages(
  runId: string,
  text: string,
  topK = 5,
): Promise<MatchResult> {
  return request<MatchResult>("/internal/match", {
    method: "POST",
    body: JSON.stringify({ runId, text, topK }),
  });
}

/** The live claims on a page, so a new source can be checked against them. */
export async function getPageClaims(pageId: string): Promise<PageClaims> {
  return request<PageClaims>(`/internal/pages/${pageId}/claims`);
}

/** Persist the compile. One transaction on the API side: it all lands, or none of it. */
export async function applyCompile(payload: unknown): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/internal/apply-compile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Progress ping, forwarded to the live activity feed. Never throws. */
export async function reportStep(runId: string, step: string, detail: string): Promise<void> {
  try {
    await request<void>("/internal/runs/step", {
      method: "POST",
      body: JSON.stringify({ runId, step, detail }),
    });
  } catch {
    // A missed progress ping must not fail an otherwise healthy compile.
  }
}

/** Record a failed run, keeping the raw model output so the failure is diagnosable. */
export async function reportFailure(
  runId: string,
  error: string,
  rawOutput?: string,
): Promise<void> {
  try {
    await request<void>("/internal/runs/failed", {
      method: "POST",
      body: JSON.stringify({ runId, error, rawOutput }),
    });
  } catch {
    // The worker also marks stuck runs as failed, so this is a best-effort path.
  }
}

/** Token usage as the AI SDK reports it. Every field is optional in practice. */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Record what one model call cost.
 *
 * Reported after the call rather than streamed during it, so a call that burned
 * tokens and then failed schema validation still lands a row — that is exactly
 * the expensive case worth seeing, and it is invisible if only successes count.
 *
 * Swallows its own errors, like `reportStep`: accounting must never be the
 * reason a compiled page is lost.
 */
export async function reportUsage(payload: {
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  status?: "ok" | "error";
  error?: string;
  runId?: string;
  chatSessionId?: string;
}): Promise<void> {
  try {
    await request<void>("/internal/usage", {
      method: "POST",
      body: JSON.stringify({
        service: "agent",
        // The workspace is not sent: the API derives it from runId or
        // chatSessionId, so the agent cannot bill another workspace.
        provider: "bedrock-mantle",
        model: config.model.id.replace(/^custom\//, ""),
        ...payload,
      }),
    });
  } catch {
    // See the note above.
  }
}
