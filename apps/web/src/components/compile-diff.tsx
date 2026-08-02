/**
 * The compile diff.
 *
 * This component is the product's argument: it shows exactly what the agent did
 * to the knowledge base on a save — which page, created or merged, which claims
 * landed, what was disputed, which edges formed. Competitors run the same step
 * invisibly; making it legible is the differentiator, so it gets real design
 * rather than a JSON dump.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { CompileDiff, EdgeRelation, Run } from "~/lib/api";
import { AlertIcon, CheckIcon, ClockIcon, MergeIcon, PlusIcon, UndoIcon } from "./icons";

const ACTION_STYLE = {
  create: {
    label: "New page",
    Icon: PlusIcon,
    fg: "text-added",
    bg: "bg-added-bg",
  },
  merge: {
    label: "Merged",
    Icon: MergeIcon,
    fg: "text-merged",
    bg: "bg-merged-bg",
  },
  addendum: {
    label: "Addendum",
    Icon: MergeIcon,
    fg: "text-merged",
    bg: "bg-merged-bg",
  },
} as const;

const RELATION_LABEL: Record<EdgeRelation, string> = {
  extends: "extends",
  contradicts: "contradicts",
  prerequisite_of: "is a prerequisite of",
  example_of: "is an example of",
  related_to: "relates to",
};

function Stat({ value, label }: { value: number; label: string }) {
  if (value === 0) return null;
  return (
    <span className="inline-flex items-baseline gap-1">
      {/* Tabular figures stop counts from shifting as they change. */}
      <span className="font-mono text-small tabular-nums">
        {value}
      </span>
      <span className="text-small text-ink-muted">{label}</span>
    </span>
  );
}

export function DiffCard({ diff, timestamp }: { diff: CompileDiff; timestamp?: string }) {
  const action = ACTION_STYLE[diff.action] ?? ACTION_STYLE.merge;
  const { Icon } = action;

  return (
    <article className="rise-in rounded-lg border border-rule bg-surface p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Icon + text, never colour alone (WCAG 1.4.1). */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${action.bg} ${action.fg}`}
        >
          <Icon width={13} height={13} />
          <span className="font-mono text-micro font-medium uppercase tracking-wider">
            {action.label}
          </span>
        </span>

        <Link
          to="/wiki/$slug"
          params={{ slug: diff.page.slug }}
          className="font-read text-h3 font-semibold text-ink decoration-rule-strong underline-offset-4 hover:text-link hover:underline"
        >
          {diff.page.title}
        </Link>

        <span className="eyebrow ml-auto shrink-0">
          rev {diff.page.revisionNo}
          {timestamp ? ` · ${timestamp}` : ""}
        </span>
      </header>

      {diff.reasoning && (
        <p className="mt-3 font-read text-small italic leading-relaxed text-ink-muted">
          {diff.reasoning}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Stat value={diff.claimsAdded} label="claims" />
        <Stat value={diff.nodesCreated.length} label="new concepts" />
        <Stat value={diff.edgesCreated.length} label="connections" />
        {diff.claimsDisputed > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-disputed-bg px-2 py-0.5 text-disputed">
            <AlertIcon width={13} height={13} />
            <span className="font-mono text-micro tabular-nums">
              {diff.claimsDisputed} disputed
            </span>
          </span>
        )}
      </div>

      {diff.sectionsAdded.length > 0 && (
        <p className="mt-3 text-small text-ink-muted">
          <span className="eyebrow mr-2">sections</span>
          {diff.sectionsAdded.join(" · ")}
        </p>
      )}

      {diff.edgesCreated.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-rule pt-3">
          {diff.edgesCreated.slice(0, 4).map((edge, i) => (
            <li
              key={`${edge.source}-${edge.target}-${i}`}
              className="text-small text-ink-muted"
            >
              <span className="text-ink">{edge.source}</span>{" "}
              <span className="font-mono text-micro text-ink-faint">
                {RELATION_LABEL[edge.relation]}
              </span>{" "}
              <span className="text-ink">{edge.target}</span>
            </li>
          ))}
          {diff.edgesCreated.length > 4 && (
            <li className="text-micro text-ink-faint">
              + {diff.edgesCreated.length - 4} more
            </li>
          )}
        </ul>
      )}

      {diff.gapsRaised.length > 0 && (
        <div className="mt-3 border-t border-rule pt-3">
          <span className="eyebrow">opened questions</span>
          <ul className="mt-1.5 space-y-1">
            {diff.gapsRaised.map((gap) => (
              <li
                key={gap}
                className="font-read text-small text-ink-muted"
              >
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** A compile that is still running, showing which stage it has reached. */
export function PendingCard({
  title,
  step,
  detail,
}: {
  title: string | null;
  step: string;
  detail: string;
}) {
  const STAGES = ["extract", "match", "compile", "link", "persist"];
  const reached = Math.max(0, STAGES.indexOf(step));

  return (
    <article className="rise-in rounded-lg border border-dashed border-rule-strong bg-surface p-5">
      <header className="flex items-center gap-2.5">
        <ClockIcon
          width={15}
          height={15}
          className="shrink-0 animate-pulse text-ink-faint"
        />
        <span className="font-read text-h3 font-semibold">
          {title ?? "Compiling…"}
        </span>
      </header>

      <ol className="mt-4 flex items-center gap-1.5" aria-label="Compile progress">
        {STAGES.map((stage, i) => (
          <li key={stage} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-0.5 rounded-full transition-colors duration-normal ${
                i <= reached ? "bg-ink" : "bg-rule"
              }`}
            />
            <span
              className={`font-mono text-micro ${
                i === reached ? "text-ink" : "text-ink-faint"
              }`}
            >
              {stage}
            </span>
          </li>
        ))}
      </ol>

      {detail && <p className="mt-3 text-small text-ink-muted">{detail}</p>}
    </article>
  );
}

export function FailedCard({
  title,
  error,
  timestamp,
  onRetry,
}: {
  title: string | null;
  error: string;
  timestamp?: string;
  /**
   * Omitted for live failures, which have no run row to re-queue yet. Every
   * cause of a failure here is transient — the agent restarting, the queue
   * being lost — so where a retry is possible it should be one click, not a
   * re-save of something already stored.
   */
  onRetry?: () => void | Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <article className="rise-in rounded-lg border border-disputed bg-disputed-bg p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-disputed">
        <AlertIcon width={15} height={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate font-read text-h3 font-semibold">
          {title ?? "Compile failed"}
        </span>
        {/* Without this a failure from an hour ago is indistinguishable from one
            that just happened, and the feed reads as a live error that will not
            go away. */}
        {timestamp && <span className="eyebrow shrink-0">{timestamp}</span>}
      </header>
      {/* The message is the actionable part — shown in full, not truncated. */}
      <p className="mt-2 font-mono text-small leading-relaxed text-ink">
        {error}
      </p>

      {onRetry && (
        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              // The card is replaced by a pending one on success, so this only
              // matters when the retry itself failed and the button must return.
              setRetrying(false);
            }
          }}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-disputed px-2.5 py-1 text-micro font-medium text-disputed transition-colors duration-fast hover:bg-disputed hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UndoIcon width={12} height={12} />
          {retrying ? "Queueing…" : "Try again"}
        </button>
      )}
    </article>
  );
}

/** Renders whichever card matches a run's state. */
/**
 * How long a run may sit queued before the feed stops implying it is moving.
 *
 * A compile takes well under a minute, so anything past this is not slow — the
 * job is gone. That happens when the queue is lost (Redis restarted) while the
 * run row survives in Postgres, and the run will never be picked up. Showing a
 * pulsing progress bar for it is the UI telling a comfortable lie.
 */
const STALLED_AFTER_MS = 10 * 60 * 1000;

export function RunCard({ run, onRetry }: { run: Run; onRetry?: (runId: string) => Promise<void> }) {
  const created = new Date(run.createdAt);
  const time = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const retry = onRetry ? () => onRetry(run.id) : undefined;

  if (run.status === "succeeded" && run.diff) return <DiffCard diff={run.diff} timestamp={time} />;
  if (run.status === "failed") {
    return (
      <FailedCard
        title={run.itemTitle}
        error={run.error ?? "Unknown error"}
        timestamp={time}
        onRetry={retry}
      />
    );
  }

  if (Date.now() - created.getTime() > STALLED_AFTER_MS) {
    return (
      <FailedCard
        title={run.itemTitle}
        error="Queued but never picked up — the compile worker was not running when this was saved."
        timestamp={time}
        onRetry={retry}
      />
    );
  }

  return <PendingCard title={run.itemTitle} step="extract" detail="Queued" />;
}

export { CheckIcon };
