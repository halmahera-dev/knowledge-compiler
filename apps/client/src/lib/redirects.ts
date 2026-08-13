/**
 * Redirect targets are restricted to paths on this app.
 *
 * The value arrives from the query string and is followed immediately after
 * someone types their password — the single best moment for an open redirect to
 * be worth something. So the rule is an allowlist of "a path on this origin",
 * and anything that could resolve elsewhere is refused rather than sanitised.
 *
 * Protocol-relative `//host` is rejected because browsers treat it as absolute,
 * and `/\host` because some parsers normalise the backslash to a slash. Both
 * pass a naive `startsWith("/")` check.
 */
export function safeRedirect(value: unknown, fallback = "/"): string {
	if (typeof value !== "string") return fallback;
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.startsWith("/\\")
	) {
		return fallback;
	}
	return value;
}
