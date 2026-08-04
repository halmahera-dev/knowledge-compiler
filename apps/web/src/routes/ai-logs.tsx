/**
 * AI Logs — what the agent has spent, and on what.
 *
 * "An agent works out where this belongs" is a sentence with a bill attached.
 * Every model call the product makes is recorded, so the question "which part of
 * this is expensive" has an answer that is not a guess.
 *
 * Two distinctions the page refuses to blur, because both are ways a usage
 * dashboard usually lies:
 *
 *   Unknown cost is not zero cost. A model with no configured rate renders as a
 *   dash and is counted separately, so the total never reads as complete when it
 *   is not.
 *
 *   Estimated tokens are not measured tokens. Embedding calls and everything
 *   reconstructed by the backfill are derived from text length; they are marked,
 *   and the count of them is stated next to the total.
 */
import { createFileRoute } from "@tanstack/react-router";

import { MeterIcon } from "~/components/icons";
import { api, type UsageList } from "~/lib/api";
import { titleHead } from "~/lib/head";
import { requireSession } from "~/lib/guards";

const EMPTY: UsageList = {
  events: [],
  summary: {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedUsd: null,
    unpricedCalls: 0,
    estimatedCalls: 0,
    byOperation: [],
  },
  total: 0,
};

export const Route = createFileRoute("/ai-logs")({
  beforeLoad: requireSession,
  head: titleHead("AI Logs"),
  component: AiLogsPage,
  loader: async () => {
    try {
      return { usage: await api.listUsage({ limit: 100 }) };
    } catch {
      return { usage: EMPTY };
    }
  },
});

/** What each operation is, in the product's own terms rather than the code's. */
const OPERATION_LABEL: Record<string, string> = {
  extract: "Extract",
  match: "Match",
  compile: "Compile",
  link: "Link",
  copilot: "Ask",
  embedding: "Embedding",
};

function label(operation: string) {
  return OPERATION_LABEL[operation] ?? operation;
}

function formatTokens(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString();
}

/**
 * Cost, at enough precision to be useful.
 *
 * Per-call amounts are frequently under a cent, and rounding those to two
 * decimals turns every row into $0.00 — which reads as free rather than as
 * small. Totals get the familiar two places.
 */
function formatUsd(value: number | null, { total = false } = {}) {
  if (value === null) return "—";
  if (total) return `$${value.toFixed(2)}`;
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toPrecision(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AiLogsPage() {
  const { usage } = Route.useLoaderData();
  const { summary, events } = usage;

  const measured = summary.calls - summary.estimatedCalls;

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-10">
      <header className="border-b border-rule pb-6">
        <p className="eyebrow">What the agent spent</p>
        <h1 className="mt-2 font-read text-h1 font-semibold tracking-[-0.02em]">AI Logs</h1>
        <p className="mt-3 max-w-[62ch] text-small leading-relaxed text-ink-muted">
          Every model call this workspace has made — which step ran it, how many
          tokens it moved, and what that cost.
        </p>
      </header>

      {summary.calls === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-lg border border-dashed border-rule py-16 text-center">
          <MeterIcon width={22} height={22} className="text-ink-faint" />
          <p className="text-small text-ink-muted">
            Nothing recorded yet. Save something, or ask a question.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Calls" value={summary.calls.toLocaleString()} />
            <Stat label="Input tokens" value={summary.inputTokens.toLocaleString()} />
            <Stat label="Output tokens" value={summary.outputTokens.toLocaleString()} />
            <Stat
              label="Estimated cost"
              value={formatUsd(summary.estimatedUsd, { total: true })}
              note={
                summary.unpricedCalls > 0
                  ? `${summary.unpricedCalls.toLocaleString()} of ${summary.calls.toLocaleString()} calls have no configured rate`
                  : undefined
              }
            />
          </section>

          {summary.unpricedCalls === summary.calls && (
            <p className="mt-4 rounded-md border border-rule bg-sunken px-4 py-3 text-small leading-relaxed text-ink-muted">
              No cost is shown because no rates are configured. Set{" "}
              <code className="rounded-sm bg-paper px-1 font-mono text-micro">AI_PRICING</code> in{" "}
              <code className="rounded-sm bg-paper px-1 font-mono text-micro">.env</code> with your
              own per-million-token rates — they depend on your region and account, so the app does
              not guess them.
            </p>
          )}

          {summary.estimatedCalls > 0 && (
            <p className="mt-3 text-micro leading-relaxed text-ink-faint">
              {measured.toLocaleString()} call{measured === 1 ? "" : "s"} report measured token
              counts. The other {summary.estimatedCalls.toLocaleString()} are estimated from text
              length — embeddings, which the provider does not count, and anything reconstructed
              from before this log existed.
            </p>
          )}

          <section className="mt-10">
            <h2 className="eyebrow">By step</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-muted">
                    <Th>Step</Th>
                    <Th align="right">Calls</Th>
                    <Th align="right">Tokens</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byOperation.map((row) => (
                    <tr key={row.operation} className="border-b border-rule/60">
                      <Td>{label(row.operation)}</Td>
                      <Td align="right">{row.calls.toLocaleString()}</Td>
                      <Td align="right">{row.totalTokens.toLocaleString()}</Td>
                      <Td align="right">{formatUsd(row.estimatedUsd, { total: true })}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="eyebrow">Recent calls</h2>
              <p className="text-micro text-ink-faint">
                {events.length.toLocaleString()} of {usage.total.toLocaleString()}
              </p>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-ink-muted">
                    <Th>When</Th>
                    <Th>Step</Th>
                    <Th>Model</Th>
                    <Th align="right">In</Th>
                    <Th align="right">Out</Th>
                    <Th align="right">Cost</Th>
                    <Th align="right">Took</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-rule/60 align-top">
                      <Td>
                        <span className="whitespace-nowrap">{formatWhen(event.createdAt)}</span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5">
                          {label(event.operation)}
                          {event.status !== "ok" && (
                            <span
                              className="text-danger"
                              title={event.error ?? "This call failed"}
                            >
                              failed
                            </span>
                          )}
                        </span>
                        <span className="block text-micro text-ink-faint">{event.service}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-micro">{event.model}</span>
                        {event.tokensEstimated && (
                          <span
                            className="block text-micro text-ink-faint"
                            title="Counts derived from text length, not reported by the provider"
                          >
                            estimated
                          </span>
                        )}
                      </Td>
                      <Td align="right">{formatTokens(event.inputTokens)}</Td>
                      <Td align="right">{formatTokens(event.outputTokens)}</Td>
                      <Td align="right">{formatUsd(event.estimatedUsd)}</Td>
                      <Td align="right">
                        {event.latencyMs === null ? "—" : `${(event.latencyMs / 1000).toFixed(1)}s`}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label: name, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-rule px-4 py-3">
      <p className="eyebrow">{name}</p>
      <p className="mt-1.5 font-read text-h2 font-semibold tracking-[-0.02em]">{value}</p>
      {note && <p className="mt-1 text-micro leading-relaxed text-ink-faint">{note}</p>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td className={`px-3 py-2.5 ${align === "right" ? "text-right tabular-nums" : "text-left"}`}>
      {children}
    </td>
  );
}
