/**
 * Deciding whether a stored URL may become a link.
 *
 * Source URLs come from two places and only one of them is a web address. A
 * saved link is fetched by the API, which rejects anything that is not http(s);
 * an uploaded PDF is archived to object storage and its `sourceUrl` is the
 * storage key — `s3://bucket/<workspace>/<hash>.pdf`. Rendering that into an
 * `href` produced a dead link on every PDF-sourced page, and printed the
 * workspace id and internal path into the document as the link text.
 *
 * Written as an allowlist rather than a denylist of bad schemes: `javascript:`
 * and `data:` are the ones everybody remembers, and the next one will not be.
 */
const WEB_URL = /^https?:\/\/\S+$/i;

/** The URL if it is safe to link to, otherwise undefined. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  return WEB_URL.test(trimmed) ? trimmed : undefined;
}

/**
 * What to show for a source, given that its URL may not be showable.
 *
 * Falls back to the title rather than the raw value: a storage key is not
 * information the reader wants, and for a pasted excerpt there is no location to
 * name at all.
 */
export function sourceLabel(
  title: string | null | undefined,
  url: string | null | undefined,
  fallback = "Pasted excerpt",
): string {
  return title?.trim() || safeHref(url) || fallback;
}
