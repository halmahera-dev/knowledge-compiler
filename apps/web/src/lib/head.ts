/**
 * Page titles.
 *
 * Every route used to inherit the root's "Knowledge Compiler", which makes a row
 * of open tabs indistinguishable and turns a shared link to a compiled page into
 * an unlabelled one. The wiki in particular is meant to be linked to.
 *
 * Leaf first, product last — the part that differs between two tabs should be the
 * part still visible when the browser truncates.
 */
const SUFFIX = "Knowledge Compiler";

export function pageTitle(leaf?: string | null): string {
  const trimmed = leaf?.trim();
  return trimmed ? `${trimmed} · ${SUFFIX}` : SUFFIX;
}

/** Route `head` for a page with a fixed name. */
export function titleHead(leaf: string) {
  return () => ({ meta: [{ title: pageTitle(leaf) }] });
}
