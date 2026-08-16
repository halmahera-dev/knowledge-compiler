"use client";

import { Badge } from "@kc/ui/components/badge";
import { Button } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import { cn } from "@kc/ui/lib/utils";
import { AlertTriangle, Clock, GitMerge, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type {
	CompileDiff,
	EdgeRelation,
	Run,
} from "@/features/capture/run-api";
import { STAGES } from "@/features/capture/run-api";

/**
 * The four states of the compile feed.
 *
 * Every one of them is a claim about what happened to something the reader
 * saved, so the distinctions are carried by icon and text — never by colour
 * alone (WCAG 1.4.1). Colour is the secondary cue throughout.
 */

const ACTION = {
	create: { label: "New page", Icon: Plus },
	merge: { label: "Merged", Icon: GitMerge },
	addendum: { label: "Addendum", Icon: GitMerge },
} as const;

const RELATION_LABEL: Record<EdgeRelation, string> = {
	extends: "extends",
	contradicts: "contradicts",
	prerequisite_of: "prerequisite of",
	example_of: "example of",
	related_to: "related to",
};

/** Zero-valued stats render nothing — "0 claims" is noise, not information. */
function Stat({ value, label }: { value: number; label: string }) {
	if (value === 0) return null;
	return (
		<span className="text-muted-foreground text-xs">
			<span className="font-mono tabular-nums">{value}</span> {label}
			{value === 1 ? "" : "s"}
		</span>
	);
}

export function DiffCard({ diff }: { diff: CompileDiff }) {
	const { label, Icon } = ACTION[diff.action];
	// Four is enough to show the shape of what connected; the rest is a count.
	const shown = diff.edgesCreated.slice(0, 4);
	const rest = diff.edgesCreated.length - shown.length;

	return (
		<Card className="fade-in-0 slide-in-from-bottom-1 animate-in duration-200">
			<CardContent>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary" className="gap-1">
						<Icon className="size-3" />
						{label}
					</Badge>
					<Link
						href={`/${diff.page.slug}`}
						className="font-medium hover:underline"
					>
						{diff.page.title}
					</Link>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						rev {diff.page.revisionNo}
					</span>
					{diff.claimsDisputed > 0 ? (
						<Badge variant="destructive">{diff.claimsDisputed} disputed</Badge>
					) : null}
				</div>

				{diff.reasoning ? (
					<p className="mt-2 text-muted-foreground text-sm italic leading-relaxed">
						{diff.reasoning}
					</p>
				) : null}

				<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
					<Stat value={diff.claimsAdded} label="claim" />
					<Stat value={diff.nodesCreated.length} label="new concept" />
					<Stat value={diff.edgesCreated.length} label="connection" />
				</div>

				{diff.sectionsAdded.length > 0 ? (
					<p className="mt-2 text-muted-foreground text-xs">
						{diff.sectionsAdded.join(" · ")}
					</p>
				) : null}

				{shown.length > 0 ? (
					<ul className="mt-2 space-y-0.5">
						{shown.map((edge) => (
							<li
								key={`${edge.source}-${edge.relation}-${edge.target}`}
								className="text-muted-foreground text-xs"
							>
								{edge.source}{" "}
								<span
									className={cn(
										"font-mono",
										edge.relation === "contradicts" && "text-destructive",
									)}
								>
									{RELATION_LABEL[edge.relation]}
								</span>{" "}
								{edge.target}
							</li>
						))}
						{rest > 0 ? (
							<li className="text-muted-foreground text-xs">+ {rest} more</li>
						) : null}
					</ul>
				) : null}

				{diff.gapsRaised.length > 0 ? (
					<p className="mt-2 text-muted-foreground text-xs">
						Opened {diff.gapsRaised.length} question
						{diff.gapsRaised.length === 1 ? "" : "s"}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

/** A compile still running, showing which stage it has reached. */
export function PendingCard({
	title,
	step,
	detail,
}: {
	title: string | null;
	step: string;
	detail: string;
}) {
	const reached = Math.max(0, STAGES.indexOf(step as (typeof STAGES)[number]));

	return (
		<Card className="fade-in-0 slide-in-from-bottom-1 animate-in border-dashed duration-200">
			<CardContent>
				<div className="flex items-center gap-2.5">
					<Clock className="size-4 shrink-0 animate-pulse text-muted-foreground" />
					<span className="font-medium">{title ?? "Compiling…"}</span>
				</div>

				<ol
					className="mt-4 flex items-center gap-1.5"
					aria-label="Compile progress"
				>
					{STAGES.map((stage, i) => (
						<li key={stage} className="flex flex-1 flex-col gap-1.5">
							<span
								className={cn(
									"h-0.5 rounded-full transition-colors",
									i <= reached ? "bg-foreground" : "bg-border",
								)}
							/>
							<span
								className={cn(
									"font-mono text-[10px]",
									i === reached ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{stage}
							</span>
						</li>
					))}
				</ol>

				{detail ? (
					<p className="mt-3 text-muted-foreground text-sm">{detail}</p>
				) : null}
			</CardContent>
		</Card>
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
		<Card className="fade-in-0 slide-in-from-bottom-1 animate-in border-destructive/40 duration-200">
			<CardContent>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-destructive">
					<AlertTriangle className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate font-medium">
						{title ?? "Compile failed"}
					</span>
					{/* Without this a failure from an hour ago is indistinguishable from
							one that just happened, and the feed reads as a live error that
							will not go away. */}
					{timestamp ? (
						<span className="shrink-0 text-muted-foreground text-xs">
							{timestamp}
						</span>
					) : null}
				</div>

				{/* The message is the actionable part — shown in full, not truncated. */}
				<p className="mt-2 font-mono text-sm leading-relaxed">{error}</p>

				{onRetry ? (
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						disabled={retrying}
						onClick={async () => {
							setRetrying(true);
							try {
								await onRetry();
							} finally {
								// The card is replaced by a pending one on success, so this
								// only matters when the retry itself failed.
								setRetrying(false);
							}
						}}
					>
						<RotateCcw className="size-3.5" />
						{retrying ? "Queueing…" : "Try again"}
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}

/**
 * How long a run may sit queued before the feed stops implying it is moving.
 *
 * A compile takes well under a minute, so anything past this is not slow — the
 * job is gone. That happens when the queue is lost (Redis restarted, or the
 * worker was never started) while the run row survives in the database, and it
 * will never be picked up. A pulsing progress bar for it is the UI telling a
 * comfortable lie.
 */
const STALLED_AFTER_MS = 10 * 60 * 1000;

/** Renders whichever card matches a stored run's state. */
export function RunCard({
	run,
	onRetry,
}: {
	run: Run;
	onRetry?: () => void | Promise<void>;
}) {
	const when = new Date(run.createdAt).toLocaleString();

	if (run.status === "succeeded" && run.diff) {
		return <DiffCard diff={run.diff} />;
	}

	if (run.status === "failed") {
		return (
			<FailedCard
				title={run.itemTitle}
				error={run.error ?? "The compile failed."}
				timestamp={when}
				onRetry={onRetry}
			/>
		);
	}

	if (Date.now() - new Date(run.createdAt).getTime() > STALLED_AFTER_MS) {
		return (
			<FailedCard
				title={run.itemTitle}
				error="Queued but never picked up — the compile worker was not running when this was saved."
				timestamp={when}
				onRetry={onRetry}
			/>
		);
	}

	return <PendingCard title={run.itemTitle} step="extract" detail="Queued" />;
}
