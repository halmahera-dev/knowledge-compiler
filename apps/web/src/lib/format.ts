/**
 * Display strings.
 *
 * Small, dull, and gathered here because every one of them has been wrong at
 * least once: a size that rendered "0.0 MB", a spoken title that read eighty
 * characters of prose aloud. They are pure, so they are testable — which is the
 * whole reason they do not live inside the route that uses them.
 */
import type { CompileDiff } from "./api";

/**
 * Ends a spoken clause with exactly one terminator.
 *
 * A truncated title already ends in an ellipsis, so appending a full stop gave
 * "…." — which a screen reader renders as a stumble rather than a pause.
 */
export function sentence(text: string): string {
  return /[.…!?]$/.test(text) ? text : `${text}.`;
}

/** Megabytes only once there is a megabyte to show — "0.0 MB" reads as broken. */
export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}


/**
 * Shortens a title for speech.
 *
 * A pasted excerpt has no real title yet, so the server derives one from the
 * opening words — fine to glance at on a card, but a screen reader announces the
 * whole thing, and eighty characters of prose read aloud is not an announcement.
 * Cut on a word boundary; a mid-word cut is worse spoken than seen.
 */
export function spokenTitle(title: string | null, limit = 48): string {
  const clean = (title ?? "").replace(/…$/, "").trim();
  if (!clean) return "a saved item";
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}


/**
 * What a screen reader hears when a compile finishes.
 *
 * The whole point of the feed is watching something land, and that was purely
 * visual: cards appeared and changed with nothing announced. Reading the card
 * aloud would be unusable — a diff carries a page title, an action, and counts of
 * claims, sections, nodes and edges — so this is one sentence per event, and only
 * for the transitions that mean something.
 */
export function announce(diff: CompileDiff): string {
  const verb =
    diff.action === "create"
      ? "Created"
      : diff.action === "merge"
        ? "Merged into"
        : "Added to";
  const disputed =
    diff.claimsDisputed > 0 ? `, ${diff.claimsDisputed} disputed` : "";
  return `${sentence(`${verb} ${spokenTitle(diff.page.title)}`)} ${diff.claimsAdded} claims added${disputed}.`;
}
