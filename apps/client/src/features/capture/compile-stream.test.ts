/**
 * The subscription's failure behaviour.
 *
 * All three of these are invisible in a browser until they have already cost
 * something: a leaked socket per mount, a feed that silently stops after fifteen
 * minutes, and a stream torn down by one bad frame. None of them show up as an
 * error — the page just quietly stops being live.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const token = vi.hoisted(() => ({ value: "tok" as string | null, calls: 0 }));

vi.mock("@/features/user/user-token", () => ({
	getApiToken: async () => {
		token.calls += 1;
		return token.value;
	},
}));

vi.mock("@/lib/api-client", () => ({ API_URL: "http://api.test" }));

import { subscribeToCompileEvents } from "./compile-stream";

/** Enough of EventSource to drive the code under test. */
class FakeEventSource {
	static instances: FakeEventSource[] = [];
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;

	readyState = FakeEventSource.CONNECTING;
	closed = false;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	private listeners = new Map<string, () => void>();

	constructor(readonly url: string) {
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, handler: () => void) {
		this.listeners.set(type, handler);
	}

	emit(type: string) {
		this.listeners.get(type)?.();
	}

	close() {
		this.closed = true;
		this.readyState = FakeEventSource.CLOSED;
	}
}

beforeEach(() => {
	FakeEventSource.instances = [];
	token.value = "tok";
	token.calls = 0;
	vi.stubGlobal("EventSource", FakeEventSource);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/** Lets the awaited token resolve without advancing timers. */
const settle = () => Promise.resolve().then(() => Promise.resolve());

describe("subscribeToCompileEvents", () => {
	it("carries the token in the query string, since EventSource cannot set headers", async () => {
		subscribeToCompileEvents({ onEvent: () => {} });
		await settle();

		expect(FakeEventSource.instances).toHaveLength(1);
		expect(FakeEventSource.instances[0].url).toBe(
			"http://api.test/api/v1/stream?token=tok",
		);
	});

	it("opens nothing when unsubscribed before the token arrives", async () => {
		// Strict Mode runs an effect twice; without the cancelled guard the first
		// continuation opens a connection after its own cleanup has run, and
		// nothing is left holding a handle to close it.
		const stop = subscribeToCompileEvents({ onEvent: () => {} });
		stop();
		await settle();

		expect(FakeEventSource.instances).toHaveLength(0);
	});

	it("re-opens with a fresh token after the stream closes", async () => {
		// The reason this exists: EventSource gives up permanently when a
		// reconnect is answered 401, and the token expires after 15 minutes.
		subscribeToCompileEvents({ onEvent: () => {} });
		await settle();

		const first = FakeEventSource.instances[0];
		first.readyState = FakeEventSource.CLOSED;
		first.onerror?.();

		expect(first.closed).toBe(true);

		await vi.advanceTimersByTimeAsync(1000);
		await settle();

		expect(FakeEventSource.instances).toHaveLength(2);
		expect(token.calls).toBe(2);
	});

	it("leaves a merely-interrupted stream to the browser's own retry", async () => {
		subscribeToCompileEvents({ onEvent: () => {} });
		await settle();

		const first = FakeEventSource.instances[0];
		first.readyState = FakeEventSource.CONNECTING;
		first.onerror?.();

		await vi.advanceTimersByTimeAsync(5000);
		// Stepping in here would open a second connection alongside the browser's.
		expect(FakeEventSource.instances).toHaveLength(1);
		expect(first.closed).toBe(false);
	});

	it("stops re-opening once unsubscribed", async () => {
		const stop = subscribeToCompileEvents({ onEvent: () => {} });
		await settle();

		const first = FakeEventSource.instances[0];
		first.readyState = FakeEventSource.CLOSED;
		first.onerror?.();
		stop();

		await vi.advanceTimersByTimeAsync(30_000);
		expect(FakeEventSource.instances).toHaveLength(1);
	});

	it("survives a malformed frame", async () => {
		const seen: unknown[] = [];
		subscribeToCompileEvents({ onEvent: (event) => seen.push(event) });
		await settle();

		const source = FakeEventSource.instances[0];
		source.onmessage?.({ data: "not json" });
		source.onmessage?.({ data: '{"type":"run.failed","runId":"r1"}' });

		expect(seen).toHaveLength(1);
		expect(source.closed).toBe(false);
	});

	it("treats a keepalive as proof the stream is alive", async () => {
		const status: boolean[] = [];
		subscribeToCompileEvents({
			onEvent: () => {},
			onStatus: (v) => status.push(v),
		});
		await settle();

		const source = FakeEventSource.instances[0];
		source.onerror?.();
		source.emit("ping");

		expect(status).toEqual([false, true]);
	});
});
