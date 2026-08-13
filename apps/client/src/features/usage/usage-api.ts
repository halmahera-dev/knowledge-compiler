/**
 * What the AI calls cost.
 *
 * Every model call the product makes is recorded by the service that made it,
 * so this is a read-only view of an existing ledger rather than an estimate
 * assembled in the browser.
 */
import { request } from "@/lib/api-client";

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
	inputTokens: number;
	outputTokens: number;
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

export function fetchUsage(
	params: { days?: number; operation?: string; limit?: number } = {},
): Promise<UsageList> {
	const query = new URLSearchParams();
	if (params.days !== undefined) query.set("days", String(params.days));
	if (params.operation) query.set("operation", params.operation);
	if (params.limit !== undefined) query.set("limit", String(params.limit));

	const suffix = query.toString();
	return request<UsageList>(`/api/v1/ai-usage${suffix ? `?${suffix}` : ""}`);
}
