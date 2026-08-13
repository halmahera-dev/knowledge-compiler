/**
 * Compile runs, and the live feed of what they are doing.
 *
 * A run is the durable record; the SSE stream is the same story told as it
 * happens. Both are needed: the stream only knows about compiles that started
 * while this tab was open, and the history only knows about ones that finished.
 */
import { request } from "@/lib/api-client";

export type CompileAction = "create" | "merge" | "addendum";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type EdgeRelation =
	| "extends"
	| "contradicts"
	| "prerequisite_of"
	| "example_of"
	| "related_to";

/** What one compile did to the knowledge base. */
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

/** The five stages a compile passes through, in order. */
export const STAGES = [
	"extract",
	"match",
	"compile",
	"link",
	"persist",
] as const;
export type Stage = (typeof STAGES)[number];

/**
 * One frame of the compile stream.
 *
 * `workspaceId` is on every variant because the server puts it there. The
 * retired client's type omitted it, which made the field invisible to anyone
 * reading the code — and it is the field that says whether an event is yours.
 */
export type CompileEvent =
	| {
			type: "run.started";
			runId: string;
			rawItemId: string;
			title: string | null;
			workspaceId: string;
	  }
	| {
			type: "run.step";
			runId: string;
			step: Stage;
			detail: string;
			workspaceId: string;
	  }
	| { type: "run.succeeded"; runId: string; diff: CompileDiff; workspaceId: string }
	| { type: "run.failed"; runId: string; error: string; workspaceId: string };

export function fetchRuns(): Promise<Run[]> {
	return request<Run[]>("/api/v1/runs");
}

/** Re-queue a failed or stuck run. The API refuses anything else with a 409. */
export function retryRun(runId: string): Promise<Run> {
	return request<Run>(`/api/v1/runs/${runId}/retry`, { method: "POST" });
}
