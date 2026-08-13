/**
 * The part of a failure worth showing a reader.
 *
 * A stack trace in front of someone is noise they cannot act on, and in
 * production it is also a disclosure. So this returns one sentence and never
 * the stack.
 *
 * The fetch case is named explicitly because it is true almost every time in
 * development — the API or the agent is not running — and a specific guess that
 * turns out wrong is still more useful than "an error occurred".
 */
const NETWORK = /fetch|network|ECONNREFUSED|ECONNRESET|Failed to fetch|NetworkError/i;

export function describeError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? "");

	if (NETWORK.test(message)) {
		return "The API did not respond. If you are running this locally, check that `pnpm dev` is still up.";
	}

	return message.trim() || "Something failed while loading this page.";
}
