"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { announce, spokenTitle } from "@/features/capture/announce";
import { captureKeys } from "@/features/capture/capture-cache";
import { subscribeToCompileEvents } from "@/features/capture/compile-stream";
import { runsQueryOptions } from "@/features/capture/capture-query-options";
import type { CompileDiff, Stage } from "@/features/capture/run-api";
import { authClient } from "@/features/user/user-client";
import { wikiKeys } from "@/features/wiki/wiki-cache";

/** A compile currently in flight, as the stream describes it. */
export interface LiveRun {
	runId: string;
	title: string | null;
	step: Stage;
	detail: string;
}

export interface FailedRun {
	runId: string;
	title: string | null;
	error: string;
}

/**
 * The compile feed: finished runs from the API, in-flight ones from the stream.
 *
 * The live half is deliberately **local state, not query cache**. `run.step` has
 * no counterpart on the server's `Run` shape, so writing it into the cache would
 * invent a client-only field inside a server type; and any invalidation
 * mid-compile would wipe the stage and make the progress bar jump backwards.
 * The two are reconciled at render instead, where the overlay simply wins.
 */
export function useCompileFeed() {
	const queryClient = useQueryClient();
	const runs = useQuery(runsQueryOptions());

	const { data: activeOrganization } = authClient.useActiveOrganization();
	const workspaceId = activeOrganization?.id ?? null;

	const [live, setLive] = useState<Record<string, LiveRun>>({});
	const [completed, setCompleted] = useState<CompileDiff[]>([]);
	const [failed, setFailed] = useState<FailedRun[]>([]);
	const [connected, setConnected] = useState(true);
	const [spoken, setSpoken] = useState("");

	// The handler reads nothing from render scope except these setters, so it is
	// safe to keep out of the effect's dependencies — and keeping it out is what
	// stops the subscription being torn down on every state change.
	const queryClientRef = useRef(queryClient);
	queryClientRef.current = queryClient;

	// A mirror of `live`, so the event handler can read a title without either
	// depending on the state (which would re-subscribe on every step) or reading
	// it inside a state updater (which React is free to run twice).
	const liveRef = useRef<Record<string, LiveRun>>({});
	liveRef.current = live;

	useEffect(() => {
		// No workspace means no stream to watch: the server would refuse the token
		// anyway, and re-keying on the id is what tears this down and re-opens it
		// when the reader switches workspace.
		if (!workspaceId) return;

		const unsubscribe = subscribeToCompileEvents({
			onStatus: setConnected,
			onEvent: (event) => {
				// The server filters by workspace already. This is the second lock:
				// it costs one comparison and makes the client honest if the server
				// filter ever regresses.
				if (event.workspaceId !== workspaceId) return;

				switch (event.type) {
					case "run.started":
						setLive((current) => ({
							...current,
							[event.runId]: {
								runId: event.runId,
								title: event.title,
								step: "extract",
								detail: "Starting",
							},
						}));
						setSpoken(`Compiling ${spokenTitle(event.title)}`);
						break;

					case "run.step":
						setLive((current) =>
							// Only for runs already on screen. A step for a compile this
							// tab never saw start belongs to the history, not the overlay.
							current[event.runId]
								? {
										...current,
										[event.runId]: {
											...current[event.runId],
											step: event.step,
											detail: event.detail,
										},
									}
								: current,
						);
						break;

					case "run.succeeded": {
						setLive((current) => {
							const { [event.runId]: _done, ...rest } = current;
							return rest;
						});
						setCompleted((current) => [event.diff, ...current]);
						setSpoken(announce(event.diff));

						const client = queryClientRef.current;
						client.invalidateQueries({ queryKey: captureKeys.runs() });
						// A compile that finishes while the reader is on the index should
						// make the page appear there. The retired app could not do this —
						// its wiki was loader-driven and only refreshed on navigation.
						client.invalidateQueries({ queryKey: wikiKeys.pages() });
						client.invalidateQueries({
							queryKey: wikiKeys.page(event.diff.page.slug),
						});
						break;
					}

					case "run.failed": {
						// The title is read from a ref rather than from inside the
						// `setLive` updater: React may run an updater more than once, and
						// a `setFailed` nested in one would append the same failure twice.
						const title = liveRef.current[event.runId]?.title ?? null;
						setLive((current) => {
							const { [event.runId]: _gone, ...rest } = current;
							return rest;
						});
						setFailed((current) => [
							{ runId: event.runId, title, error: event.error },
							...current,
						]);
						setSpoken(`Compile failed: ${event.error}`);
						queryClientRef.current.invalidateQueries({
							queryKey: captureKeys.runs(),
						});
						break;
					}
				}
			},
		});

		return unsubscribe;
	}, [workspaceId]);

	/** Drops a run from the overlay once the history has caught up with it. */
	const forget = useCallback((runId: string) => {
		setCompleted((current) => current.filter((diff) => diff.runId !== runId));
		setFailed((current) => current.filter((run) => run.runId !== runId));
	}, []);

	// The overlay always wins: a run showing live progress must not also appear
	// as a stale history row underneath it.
	const shown = new Set([
		...Object.keys(live),
		...completed.map((diff) => diff.runId),
		...failed.map((run) => run.runId),
	]);
	const history = (runs.data ?? []).filter((run) => !shown.has(run.id));

	return {
		runs,
		history,
		live: Object.values(live),
		completed,
		failed,
		connected,
		spoken,
		forget,
	};
}
