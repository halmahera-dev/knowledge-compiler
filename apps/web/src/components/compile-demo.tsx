/**
 * The landing page's centrepiece: the compile, run on real-looking material.
 *
 * A feature list would have to assert that the product reads once and writes a
 * cited wiki. This shows it instead — three sources go in, claims come out, two
 * of them disagree and the page says so rather than picking a winner. That last
 * part is the whole argument against a summariser, and it cannot be made in a
 * bullet point.
 *
 * Hovering or focusing a claim marks the source it came from, and vice versa.
 * Provenance is the product, so it is the interaction.
 */
import { useState } from "react";

import { AlertIcon, LinkIcon, QuoteIcon } from "~/components/icons";
import { useTablist } from "~/hooks/use-tablist";

interface Source {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
}

interface Claim {
  id: string;
  sourceId: string;
  section: string;
  text: string;
  quote: string;
  /** Set on both halves of a pair the compiler could not reconcile. */
  disputed?: boolean;
}

const SOURCES: Source[] = [
  {
    id: "s1",
    kind: "Paper",
    title: "LLM.int8(): 8-bit matrix multiplication",
    excerpt:
      "We find that a small number of feature dimensions — fewer than 0.1% of channels — carry activation magnitudes up to 20× the median, and that quantising these uniformly is what destroys accuracy at scale.",
  },
  {
    id: "s2",
    kind: "Note",
    title: "Quantisation, in practice",
    excerpt:
      "For anything above 7B, 4-bit weight-only quantisation is effectively free. I have run it across a dozen models and never seen a benchmark move more than a point.",
  },
  {
    id: "s3",
    kind: "PDF",
    title: "Reasoning under 4-bit weights",
    excerpt:
      "Aggregate benchmarks conceal the cost. On multi-step arithmetic and chain-of-thought tasks, 4-bit models lose 9–14 points, while single-hop retrieval is unchanged.",
  },
];

const CLAIMS: Claim[] = [
  {
    id: "c1",
    sourceId: "s1",
    section: "Where the error comes from",
    text: "Fewer than 0.1% of channels carry outlier activations, up to 20× the median.",
    quote: "fewer than 0.1% of channels — carry activation magnitudes up to 20× the median",
  },
  {
    id: "c2",
    sourceId: "s1",
    section: "Where the error comes from",
    text: "Quantising those outlier channels uniformly is the dominant source of accuracy loss.",
    quote: "quantising these uniformly is what destroys accuracy at scale",
  },
  {
    id: "c3",
    sourceId: "s2",
    section: "How far it can be pushed",
    text: "4-bit weight-only quantisation is near-lossless above 7B parameters.",
    quote: "4-bit weight-only quantisation is effectively free",
    disputed: true,
  },
  {
    id: "c4",
    sourceId: "s3",
    section: "How far it can be pushed",
    text: "4-bit costs 9–14 points on multi-step reasoning, which aggregate benchmarks hide.",
    quote: "4-bit models lose 9–14 points, while single-hop retrieval is unchanged",
    disputed: true,
  },
];

const STAGES = [
  { id: 0, label: "Captured", note: "Three things you saved this week." },
  { id: 1, label: "Extracted", note: "Each read once. Claims lifted out, with the quote behind them." },
  { id: 2, label: "Compiled", note: "Merged into one page. Where they disagree, both stay." },
] as const;

const SECTIONS = [...new Set(CLAIMS.map((c) => c.section))];

export function CompileDemo() {
  const [stage, setStage] = useState(2);
  // Which source is under the reader's attention, from either column.
  const [marked, setMarked] = useState<string | null>(null);
  const tabs = useTablist({
    ids: STAGES.map((s) => s.id),
    active: stage,
    onChange: setStage,
    name: "demo",
  });

  return (
    <section aria-labelledby="demo-heading" className="mx-auto max-w-[76rem] px-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="eyebrow">One topic, three sources</p>
          <h2 id="demo-heading" className="mt-1.5 font-read text-h2 font-semibold tracking-[-0.02em]">
            What compiling actually does
          </h2>
        </div>

        {/* Stage control. Defaults to the finished page — the payoff first, with
            the working shown to anyone who wants to check it. */}
        <div role="tablist" aria-label="Compile stage" className="flex rounded-md border border-rule">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              {...tabs.tabProps(s.id)}
              className={`cursor-pointer px-3 py-2 font-mono text-micro uppercase tracking-wider transition-colors duration-fast ${
                i > 0 ? "border-l border-rule" : ""
              } ${stage === s.id ? "bg-ink text-paper" : "text-ink-muted hover:bg-sunken hover:text-ink"}`}
            >
              <span aria-hidden="true" className="opacity-50">
                {i + 1}
              </span>{" "}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 max-w-[58ch] text-small leading-relaxed text-ink-muted">
        {STAGES[stage]!.note}
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-12 lg:gap-0" {...tabs.panelProps}>
        {/* Sources rail. Narrower than the page it feeds, and set on the sunken
            ground so the compiled page reads as the thing in front.

            The right padding is not decoration: the compiled page overlaps this
            column by 24px to layer the two, and without clearance that overlap
            landed on top of the card text — 9px of every source ran underneath an
            opaque panel. Reserving more than the overlap keeps the depth and
            stops it eating the content. */}
        <div className="lg:col-span-5 lg:pr-10">
          <p className="eyebrow">Saved</p>
          <ul className="mt-3 space-y-3">
            {SOURCES.map((source) => {
              const isMarked = marked === source.id;
              return (
                <li key={source.id}>
                  <div
                    onMouseEnter={() => setMarked(source.id)}
                    onMouseLeave={() => setMarked(null)}
                    className={`rounded-md border bg-sunken p-3.5 transition-all duration-normal ${
                      isMarked
                        ? "border-rule-strong shadow-sm"
                        : "border-rule"
                    } ${marked && !isMarked ? "opacity-45" : ""}`}
                  >
                    <p className="flex items-center gap-2">
                      <span className="rounded-sm bg-paper px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-ink-faint">
                        {source.kind}
                      </span>
                      <span className="truncate text-small font-medium">{source.title}</span>
                    </p>
                    {/* Full text while it is the only thing on screen; clamped
                        once the claims below it are the point. Clamping is done
                        by CSS so the cut lands on a line, not mid-word. */}
                    <p
                      className={`mt-2 font-read text-small leading-relaxed text-ink-muted ${
                        stage === 0 ? "" : "line-clamp-2"
                      }`}
                    >
                      {source.excerpt}
                    </p>

                    {/* From stage 1 the claims lifted from this source appear
                        under it, so extraction is visibly per-source. */}
                    {stage >= 1 && (
                      <ul className="mt-2.5 space-y-1 border-t border-rule pt-2.5">
                        {CLAIMS.filter((c) => c.sourceId === source.id).map((c) => (
                          <li
                            key={c.id}
                            className="flex gap-1.5 font-mono text-micro leading-relaxed text-ink-faint"
                          >
                            <span aria-hidden="true">→</span>
                            <span>{c.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The compiled page. Overlaps the rail on wide screens so the two are
            layered rather than sitting in tidy parallel columns. */}
        <div className="lg:col-span-7 lg:-ml-6 lg:pt-7">
          <div className="rounded-lg border border-rule-strong bg-surface shadow-lg">
            <div className="border-b border-rule px-5 py-3.5">
              <p className="eyebrow">Wiki page</p>
              <p className="mt-1 font-read text-h3 font-semibold">Post-training quantisation</p>
            </div>

            {stage < 2 ? (
              <p className="px-5 py-10 text-center font-mono text-micro uppercase tracking-wider text-ink-faint">
                {stage === 0 ? "nothing compiled yet" : "merging…"}
              </p>
            ) : (
              <div className="px-5 py-4">
                {SECTIONS.map((section) => (
                  <section key={section} className="mt-4 first:mt-0">
                    <h3 className="eyebrow">{section}</h3>
                    <ul className="mt-2 space-y-2.5">
                      {CLAIMS.filter((c) => c.section === section).map((claim) => {
                        const isMarked = marked === claim.sourceId;
                        return (
                          <li
                            key={claim.id}
                            onMouseEnter={() => setMarked(claim.sourceId)}
                            onMouseLeave={() => setMarked(null)}
                            className={`border-l-2 pl-3 transition-all duration-normal ${
                              claim.disputed ? "border-disputed" : "border-rule"
                            } ${isMarked ? "bg-sunken" : ""} ${
                              marked && !isMarked ? "opacity-45" : ""
                            }`}
                          >
                            <p className="font-read text-body leading-relaxed">{claim.text}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {/* Truncated by CSS, not by slicing — a character
                                  count cuts mid-word and reads as a bug. */}
                              <span className="inline-flex max-w-[22ch] items-center gap-1 font-mono text-micro text-ink-faint">
                                <LinkIcon width={11} height={11} className="shrink-0" />
                                <span className="truncate">
                                  {SOURCES.find((s) => s.id === claim.sourceId)?.title}
                                </span>
                              </span>
                              {claim.disputed && (
                                <span className="inline-flex items-center gap-1 rounded-sm bg-disputed-bg px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-disputed">
                                  <AlertIcon width={10} height={10} />
                                  disputed
                                </span>
                              )}
                            </p>
                            {/* The quote is the check. It is always present, not
                                revealed on demand, because a citation you have to
                                go looking for does not get looked at. */}
                            <blockquote className="mt-1.5 flex gap-1.5 font-read text-small italic leading-relaxed text-ink-muted">
                              <QuoteIcon width={11} height={11} className="mt-1 shrink-0" />
                              <span>{claim.quote}</span>
                            </blockquote>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          {stage === 2 && (
            <p className="mt-3 max-w-[52ch] text-small leading-relaxed text-ink-muted">
              The note and the PDF contradict each other. Nothing here decides which is
              right — both are on the page, marked, with the passage each came from.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
