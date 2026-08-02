/**
 * Knowledge gaps — questions the knowledge base cannot yet answer.
 *
 * Surfacing what is *missing* is something no competitor does: Recall, Glasp and
 * Readwise all only ever show you what you already saved.
 */
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { CompassIcon } from "~/components/icons";
import { api, type Gap } from "~/lib/api";
import { titleHead } from "~/lib/head";
import { requireSession } from "~/lib/guards";

export const Route = createFileRoute("/gaps")({
  beforeLoad: requireSession,
  head: titleHead("Gaps"),
  component: GapsPage,
  loader: async () => {
    try {
      return { gaps: await api.listGaps() };
    } catch {
      return { gaps: [] as Gap[] };
    }
  },
});

function GapsPage() {
  const { gaps } = Route.useLoaderData();
  const router = useRouter();
  const [dismissing, setDismissing] = useState<string | null>(null);

  async function dismiss(id: string) {
    setDismissing(id);
    try {
      await api.dismissGap(id);
      await router.invalidate();
    } finally {
      setDismissing(null);
    }
  }

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-10">
      <header className="border-b border-rule pb-6">
        <p className="eyebrow">What you haven&rsquo;t read yet</p>
        <h1 className="mt-2 font-read text-h1 font-semibold tracking-[-0.02em]">
          Open questions
        </h1>
        <p className="mt-3 max-w-[62ch] text-small leading-relaxed text-ink-muted">
          Prerequisites and follow-ups the agent noticed while compiling — topics your reading leans
          on but never covers.
        </p>
      </header>

      {gaps.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-rule p-14 text-center">
          <CompassIcon width={28} height={28} className="mx-auto text-ink-faint" />
          <p className="mt-4 font-read text-lead text-ink-muted">
            No open questions.
          </p>
          <p className="mt-2 text-small text-ink-faint">
            They appear as the agent finds gaps in what you&rsquo;ve read.
          </p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-rule">
          {gaps.map((gap) => (
            <li key={gap.id} className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 className="font-read text-h3 font-semibold leading-snug">
                  {gap.question}
                </h2>
                {gap.reason && (
                  <p className="mt-1.5 max-w-[68ch] font-read text-small leading-relaxed text-ink-muted">
                    {gap.reason}
                  </p>
                )}
                {gap.nodeLabel && (
                  <p className="mt-2">
                    <span className="eyebrow mr-2">from</span>
                    {gap.nodeSlug ? (
                      <Link
                        to="/wiki/$slug"
                        params={{ slug: gap.nodeSlug }}
                        className="text-small text-link underline underline-offset-4 hover:text-link-hover"
                      >
                        {gap.nodeLabel}
                      </Link>
                    ) : (
                      <span className="text-small text-ink-muted">
                        {gap.nodeLabel}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(gap.id)}
                disabled={dismissing === gap.id}
                className="h-11 shrink-0 cursor-pointer rounded-md border border-rule px-4 text-small text-ink-muted transition-colors duration-fast hover:border-rule-strong hover:text-ink disabled:opacity-40"
              >
                {dismissing === gap.id ? "Dismissing…" : "Dismiss"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
