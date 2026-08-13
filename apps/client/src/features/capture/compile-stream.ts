import { getApiToken } from "@/features/user/user-token";
import { API_URL } from "@/lib/api-client";
import type { CompileEvent } from "./run-api";

/**
 * The live compile feed, as a self-healing subscription.
 *
 * Two failure modes this exists to survive, both of which the retired app had:
 *
 * **Token expiry ends the stream permanently.** `EventSource` reconnects on a
 * dropped connection, but the spec says a reconnect answered with a non-200 is
 * fatal and the browser stops trying. Tokens last 15 minutes and
 * `/api/v1/stream` returns 401 without one, so a tab left open on the capture
 * page simply stopped receiving events — silently, with the page still looking
 * fine. So a closed stream is re-opened here with a freshly minted token.
 *
 * **A late token resolves after unmount.** The token is fetched asynchronously,
 * so without the `cancelled` flag the continuation of an effect that has already
 * been cleaned up opens a connection nobody holds a handle to. In Strict Mode
 * that is one leaked connection per mount, invisible unless you count sockets.
 */

/** Backoff between re-opens: doubles, capped so a dead API is not hammered. */
const MAX_BACKOFF_MS = 30_000;

export interface CompileStreamHandlers {
	onEvent: (event: CompileEvent) => void;
	/** Called when the connection drops, and again when it comes back. */
	onStatus?: (connected: boolean) => void;
}

/** Subscribes until the returned function is called. */
export function subscribeToCompileEvents({
	onEvent,
	onStatus,
}: CompileStreamHandlers): () => void {
	let cancelled = false;
	let source: EventSource | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let attempt = 0;

	async function open() {
		const token = await getApiToken();
		if (cancelled) return;

		// The token travels as a query parameter because EventSource cannot set
		// headers. Acceptable for a short-lived, read-only stream; a write
		// endpoint would not get this treatment.
		const url = token
			? `${API_URL}/api/v1/stream?token=${encodeURIComponent(token)}`
			: `${API_URL}/api/v1/stream`;

		source = new EventSource(url);

		source.onopen = () => {
			attempt = 0;
			onStatus?.(true);
		};

		// The server names its keepalive `ping`, and `onmessage` only fires for
		// unnamed events — so pings are already invisible there. Listening for
		// them explicitly turns the keepalive into proof the stream is alive, so
		// a recovered connection clears the warning within 15 seconds instead of
		// waiting for the next compile.
		source.addEventListener("ping", () => onStatus?.(true));

		source.onmessage = (message) => {
			try {
				onEvent(JSON.parse(message.data) as CompileEvent);
				onStatus?.(true);
			} catch {
				// A malformed frame must not tear down a working stream.
			}
		};

		source.onerror = () => {
			onStatus?.(false);
			// Anything short of CLOSED means the browser is still retrying by
			// itself; stepping in would open a second connection.
			if (!source || source.readyState !== EventSource.CLOSED) return;

			source.close();
			source = null;
			if (cancelled) return;

			const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
			attempt += 1;
			timer = setTimeout(open, delay);
		};
	}

	void open();

	return () => {
		cancelled = true;
		if (timer) clearTimeout(timer);
		source?.close();
		source = null;
	};
}
