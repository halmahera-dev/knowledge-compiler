/**
 * A compiled wiki page.
 *
 * Laid out asymmetrically with a marginalia rail rather than as a centred
 * column, because a reference work annotates in the margin: sources, disputed
 * claims, related pages, and revision history sit beside the prose instead of
 * being buried under it.
 */
import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AlertIcon, QuoteIcon, UndoIcon } from "~/components/icons";
import { ApiError, api, type Claim, type PageDetail } from "~/lib/api";
import { pageTitle } from "~/lib/head";
import { safeHref, sourceLabel } from "~/lib/url";
import { requireSession } from "~/lib/guards";

export const Route = createFileRoute("/wiki/$slug")({
  beforeLoad: requireSession,
  component: WikiPage,
  loader: async ({ params }) => {
    try {
      return { page: await api.getPage(params.slug) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  // Declared after `loader` — the options object is typed positionally, so a
  // `head` placed above it sees `loaderData` as `never`.
  //
  // Named after the compiled page rather than the app: this is the route people
  // actually share, and "Knowledge Compiler" tells the recipient nothing about
  // what they are being sent. Undefined while the loader is pending, and on the
  // not-found path, where the generic title is the honest one.
  head: ({ loaderData }) => ({ meta: [{ title: pageTitle(loaderData?.page.title) }] }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-[76rem] px-5 py-20 text-center">
      <p className="font-read text-h2">No such page.</p>
      <Link
        to="/wiki"
        className="mt-4 inline-block text-small text-link underline underline-offset-4"
      >
        Back to the wiki
      </Link>
    </div>
  ),
});

function ClaimRow({ claim }: { claim: Claim }) {
  const [showSources, setShowSources] = useState(false);
  const disputed = claim.status === "disputed";

  return (
    <li
      className={`group relative py-2.5 pl-4 ${
        disputed ? "border-l-2 border-disputed" : "border-l border-rule"
      }`}
    >
      <p className="font-read text-body leading-relaxed">
        {claim.text}
        {disputed && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-disputed-bg px-1.5 py-0.5 align-middle text-disputed">
            <AlertIcon width={11} height={11} />
            <span className="font-mono text-micro uppercase tracking-wide">
              disputed
            </span>
          </span>
        )}
      </p>

      {claim.sources.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            aria-expanded={showSources}
            className="mt-1 inline-flex cursor-pointer items-center gap-1.5 font-mono text-micro text-ink-faint transition-colors duration-fast hover:text-link"
          >
            <QuoteIcon width={12} height={12} />
            {claim.sources.length} source{claim.sources.length === 1 ? "" : "s"}
            {showSources ? " ▾" : " ▸"}
          </button>

          {showSources && (
            <ul className="mt-2 space-y-2 border-l-2 border-rule pl-3">
              {claim.sources.map((source, i) => (
                <li key={`${source.rawItemId}-${i}`}>
                  {/* The verbatim span the claim came from — this is the
                      provenance the whole design is built around. */}
                  <blockquote className="font-read text-small italic leading-relaxed text-ink-muted">
                    “{source.quote}”
                  </blockquote>
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-micro text-ink-faint">
                    {source.stance === "contradicts" && (
                      <span className="text-disputed">contradicts ·</span>
                    )}
                    {safeHref(source.sourceUrl) ? (
                      <a
                        href={safeHref(source.sourceUrl)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-link underline underline-offset-2 hover:text-link-hover"
                      >
                        {sourceLabel(source.sourceTitle, source.sourceUrl, "pasted excerpt")}
                      </a>
                    ) : (
                      sourceLabel(source.sourceTitle, source.sourceUrl, "pasted excerpt")
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function WikiPage() {
  const { page } = Route.useLoaderData();
  const router = useRouter();
  const [reverting, setReverting] = useState(false);

  const bySection = new Map<string, Claim[]>();
  for (const claim of page.claims) {
    const list = bySection.get(claim.section) ?? [];
    list.push(claim);
    bySection.set(claim.section, list);
  }

  const disputedCount = page.claims.filter((c) => c.status === "disputed").length;

  async function revert(revisionNo: number) {
    setReverting(true);
    try {
      await api.revertPage(page.id, revisionNo);
      await router.invalidate();
    } finally {
      setReverting(false);
    }
  }

  return (
    <article className="mx-auto max-w-[76rem] px-5 py-10">
      <header className="border-b border-rule pb-7">
        <Link to="/wiki" className="eyebrow hover:text-link">
          ← Wiki
        </Link>
        <h1 className="mt-3 font-read text-display font-semibold leading-[1.05] tracking-[-0.028em]">
          {page.title}
        </h1>
        <p className="mt-4 max-w-[68ch] font-read text-lead leading-relaxed text-ink-muted">
          {page.summary}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="eyebrow">revision {page.revisionNo}</span>
          <span className="eyebrow">{page.sources.length} sources</span>
          <span className="eyebrow">{page.claims.length} claims</span>
          {disputedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-disputed-bg px-2.5 py-1 text-disputed">
              <AlertIcon width={12} height={12} />
              <span className="font-mono text-micro uppercase tracking-wider">
                {disputedCount} disputed
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-12 pt-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
        {/* ── body ────────────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {page.sections.map((section) => (
            <section key={section.heading} className="mb-10">
              <h2 className="font-read text-h2 font-semibold tracking-[-0.015em]">
                {section.heading}
              </h2>
              <div className="prose-read mt-3 text-ink">
                {section.body.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>

              {(bySection.get(section.heading)?.length ?? 0) > 0 && (
                <ul className="mt-5 space-y-1">
                  {bySection.get(section.heading)!.map((claim) => (
                    <ClaimRow key={claim.id} claim={claim} />
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Claims whose section no longer exists in the body still belong to
              the page — dropping them would lose sourced material. */}
          {(() => {
            const known = new Set(page.sections.map((s) => s.heading));
            const orphans = page.claims.filter((c) => !known.has(c.section));
            if (orphans.length === 0) return null;
            return (
              <section className="mb-10">
                <h2 className="font-read text-h2 font-semibold">
                  Further claims
                </h2>
                <ul className="mt-4 space-y-1">
                  {orphans.map((claim) => (
                    <ClaimRow key={claim.id} claim={claim} />
                  ))}
                </ul>
              </section>
            );
          })()}

          {page.sections.length === 0 && page.claims.length === 0 && (
            <p className="font-read text-ink-muted">
              This page has no body yet.
            </p>
          )}
        </div>

        {/* ── marginalia ──────────────────────────────────────────────────── */}
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <section>
            <h2 className="eyebrow">Sources</h2>
            <ul className="mt-3 space-y-3">
              {page.sources.map((source) => (
                <li key={source.id}>
                  {safeHref(source.sourceUrl) ? (
                    <a
                      href={safeHref(source.sourceUrl)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-read text-small leading-snug text-link underline decoration-rule-strong underline-offset-4 hover:text-link-hover"
                    >
                      {sourceLabel(source.title, source.sourceUrl)}
                    </a>
                  ) : (
                    <span className="font-read text-small leading-snug text-ink-muted">
                      {sourceLabel(source.title, source.sourceUrl)}
                    </span>
                  )}
                  <span className="mt-0.5 block font-mono text-micro text-ink-faint">
                    {source.captureType} · {new Date(source.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
              {page.sources.length === 0 && (
                <li className="text-small text-ink-faint">None recorded.</li>
              )}
            </ul>
          </section>

          {page.backlinks.length > 0 && (
            <section>
              <h2 className="eyebrow">See also</h2>
              <ul className="mt-3 space-y-2">
                {page.backlinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      to="/wiki/$slug"
                      params={{ slug: link.slug }}
                      className="font-read text-small text-ink decoration-rule-strong underline-offset-4 hover:text-link hover:underline"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {page.revisions.length > 0 && (
            <section>
              <h2 className="eyebrow">History</h2>
              <ul className="mt-3 space-y-1.5">
                {page.revisions.map((revision) => {
                  const isLive = revision.revisionNo === page.revisionNo;
                  return (
                    <li key={revision.id} className="flex items-center gap-2">
                      <span
                        className={`font-mono text-micro tabular-nums ${
                          isLive ? "text-ink" : "text-ink-faint"
                        }`}
                      >
                        r{revision.revisionNo}
                      </span>
                      <span className="flex-1 truncate text-micro text-ink-faint">
                        {revision.action ?? "—"} ·{" "}
                        {new Date(revision.createdAt).toLocaleDateString()}
                      </span>
                      {/* Undo a bad compile. Only offered for earlier revisions,
                          since reverting to the live one is a no-op. */}
                      {!isLive && (
                        <button
                          type="button"
                          onClick={() => revert(revision.revisionNo)}
                          disabled={reverting}
                          title={`Revert to revision ${revision.revisionNo}`}
                          aria-label={`Revert to revision ${revision.revisionNo}`}
                          className="cursor-pointer rounded-sm p-1 text-ink-faint transition-colors duration-fast hover:bg-sunken hover:text-ink disabled:opacity-40"
                        >
                          <UndoIcon width={13} height={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
