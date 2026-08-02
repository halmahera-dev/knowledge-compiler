/**
 * What the app shows when a route cannot render.
 *
 * Both of these were previously TanStack's fallbacks: a bare `<p>Not Found</p>`,
 * and a development error panel with a stack trace and a "Hide Error" toggle.
 * The second is the one that mattered — it appeared inside the full app shell on
 * a URL somebody had shared, which reads as a broken product rather than as a
 * service being briefly unavailable.
 *
 * Written in the same paper/ink/serif language as the rest of the app, because a
 * failure state is still a page someone is reading.
 */
import { Link } from "@tanstack/react-router";

import { AlertIcon, CompassIcon } from "~/components/icons";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-[42rem] place-items-center px-5 py-16">
      <div className="w-full">{children}</div>
    </div>
  );
}

export function NotFoundState() {
  return (
    <Shell>
      <p className="eyebrow flex items-center gap-2">
        <CompassIcon width={13} height={13} />
        Nothing here
      </p>
      <h1 className="mt-3 font-read text-h1 font-semibold leading-tight tracking-[-0.02em]">
        No such page.
      </h1>
      <p className="prose-read mt-4 text-ink-muted">
        That URL doesn&rsquo;t match anything in the app. If you followed a link to a
        compiled page, it may belong to a different workspace &mdash; pages are scoped to
        the workspace they were compiled in, and one you are not a member of is
        indistinguishable from one that does not exist.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Link
          to="/capture"
          className="flex h-11 items-center rounded-md bg-ink px-5 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
        >
          Back to capture
        </Link>
        <Link
          to="/wiki"
          className="text-small text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors duration-fast hover:text-link"
        >
          Browse the wiki
        </Link>
      </div>
    </Shell>
  );
}

/**
 * The message worth showing, without the stack.
 *
 * A stack trace in front of a reader is noise they cannot act on, and in
 * production it is also a disclosure. The cause named here is the one that is
 * true almost every time in development — the API or agent not running — because
 * a specific wrong guess is still more useful than "an error occurred".
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/fetch|network|ECONNREFUSED|Failed to fetch/i.test(message)) {
    return "The API did not respond. If you are running this locally, check that `pnpm dev` is still up.";
  }
  return message || "Something failed while loading this page.";
}

export function ErrorState({ error, reset }: { error: unknown; reset?: () => void }) {
  return (
    <Shell>
      <p className="eyebrow flex items-center gap-2 text-disputed">
        <AlertIcon width={13} height={13} />
        Could not load
      </p>
      <h1 className="mt-3 font-read text-h1 font-semibold leading-tight tracking-[-0.02em]">
        This page didn&rsquo;t load.
      </h1>
      <p className="prose-read mt-4 text-ink-muted">
        Nothing was lost &mdash; everything you saved is still stored, and compiling
        continues in the background.
      </p>

      <p className="mt-5 rounded-md border border-rule bg-sunken px-4 py-3 font-mono text-small leading-relaxed text-ink">
        {describe(error)}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="h-11 cursor-pointer rounded-md bg-ink px-5 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
          >
            Try again
          </button>
        )}
        <Link
          to="/capture"
          className="text-small text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors duration-fast hover:text-link"
        >
          Back to capture
        </Link>
      </div>
    </Shell>
  );
}
