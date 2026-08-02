import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AlertIcon } from "~/components/icons";
import { api, type PageSummary } from "~/lib/api";
import { titleHead } from "~/lib/head";
import { requireSession } from "~/lib/guards";

export const Route = createFileRoute("/wiki/")({
  beforeLoad: requireSession,
  head: titleHead("Wiki"),
  component: WikiIndex,
  loader: async () => {
    try {
      return { pages: await api.listPages() };
    } catch {
      return { pages: [] as PageSummary[] };
    }
  },
});

function WikiIndex() {
  const { pages } = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? pages.filter(
        (p) =>
          p.title.toLowerCase().includes(needle) || p.summary.toLowerCase().includes(needle),
      )
    : pages;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="eyebrow">Compiled from what you saved</p>
          <h1 className="mt-2 font-read text-h1 font-semibold tracking-[-0.02em]">
            Wiki
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="wiki-search" className="sr-only">
            Filter pages
          </label>
          <input
            id="wiki-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter pages…"
            className="h-11 w-56 rounded-md border border-rule bg-surface px-3.5 text-small transition-colors duration-fast placeholder:text-ink-faint hover:border-rule-strong"
          />
          <span className="font-mono text-micro tabular-nums text-ink-faint">
            {visible.length}/{pages.length}
          </span>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-rule p-14 text-center">
          <p className="font-read text-lead text-ink-muted">
            {pages.length === 0 ? "No pages compiled yet." : "Nothing matches that filter."}
          </p>
          {pages.length === 0 && (
            <Link
              to="/capture"
              className="mt-4 inline-block text-small text-link underline underline-offset-4 hover:text-link-hover"
            >
              Save something to get started
            </Link>
          )}
        </div>
      ) : (
        /* Editorial list, not a card grid: a reference work is scanned by title,
           and a rule between entries reads as an index rather than a dashboard. */
        <ul className="mt-2 divide-y divide-rule">
          {visible.map((page) => (
            <li key={page.id}>
              <Link
                to="/wiki/$slug"
                params={{ slug: page.slug }}
                className="group flex flex-col gap-2 py-6 transition-colors duration-fast sm:flex-row sm:items-baseline sm:gap-8"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-read text-h2 font-semibold leading-snug tracking-[-0.015em] text-ink decoration-rule-strong underline-offset-[6px] group-hover:text-link group-hover:underline">
                    {page.title}
                  </h2>
                  <p className="mt-1.5 max-w-[68ch] font-read text-small leading-relaxed text-ink-muted">
                    {page.summary}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
                  <span className="font-mono text-micro tabular-nums text-ink-faint">
                    {page.sourceCount} source{page.sourceCount === 1 ? "" : "s"}
                  </span>
                  <span className="font-mono text-micro tabular-nums text-ink-faint">
                    {page.claimCount} claim{page.claimCount === 1 ? "" : "s"}
                  </span>
                  {page.disputedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-disputed-bg px-1.5 py-0.5 text-disputed">
                      <AlertIcon width={11} height={11} />
                      <span className="font-mono text-micro tabular-nums">
                        {page.disputedCount}
                      </span>
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
