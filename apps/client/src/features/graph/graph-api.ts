/**
 * The graph endpoints of the Python API.
 *
 * Separate from `chat-api.ts` because it answers a different question of the
 * same service: a thread keeps what was asked, the graph and its clusters keep
 * what the workspace knows.
 */
import { request } from "@/lib/api-client";

/**
 * One cluster of the topic graph, named.
 *
 * `community` is the colour index the nodes currently carry. It is not an
 * identity: detection renumbers on every save, so it is never stored against
 * anything or used to link between requests. What is durable is the membership,
 * which is why the API keys a cluster's summary to a hash of it.
 */
export interface Community {
	community: number;
	/** Null until the agent has named it, and permanently null when too small. */
	title: string | null;
	summary: string | null;
	nodeCount: number;
	pageCount: number;
	/** The heaviest concepts in it, so an unnamed cluster still says something. */
	labels: string[];
	summarisedAt: string | null;
}

/** What each cluster of the workspace's graph is about. */
export async function fetchCommunities(): Promise<Community[]> {
	const data = await request<{ communities: Community[] }>(
		"/api/v1/graph/communities",
	);
	return data.communities ?? [];
}
