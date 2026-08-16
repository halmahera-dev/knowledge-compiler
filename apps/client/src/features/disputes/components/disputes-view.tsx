"use client";

import { Badge } from "@kc/ui/components/badge";
import { Button } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { QueryError, QuerySkeleton } from "@/components/query-states";
import { setComposerDraft } from "@/features/agent/pending-message";
import { questionFor } from "@/features/disputes/dispute-question";
import type { Dispute } from "@/features/disputes/disputes-api";
import { disputesQueryOptions } from "@/features/disputes/disputes-query-options";

/**
 * What this library disagrees with itself about.
 *
 * A page shows the disputes on it; this is the question no page can answer
 * alone. There is no button to resolve one, and that is the product's position
 * rather than an omission: closing a contradiction asks the reader to decide,
 * then makes the product forget the disagreement ever happened.
 */

function DisputeCard({ dispute }: { dispute: Dispute }) {
	const router = useRouter();

	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
				<p className="font-medium">{dispute.text}</p>

				<ul className="flex flex-col gap-3">
					{dispute.sides.map((side) => (
						<li
							key={`${dispute.claimId}-${side.quote}`}
							className="border-border border-l-2 pl-3"
						>
							<Badge
								variant={
									side.stance === "contradicts" ? "destructive" : "secondary"
								}
							>
								{side.stance}
							</Badge>

							{/* The quote verbatim, not a characterisation of it. A reader
							    settling a disagreement needs the sentence itself. */}
							<blockquote className="mt-1.5 text-muted-foreground italic leading-relaxed">
								“{side.quote}”
							</blockquote>

							<p className="mt-1 text-muted-foreground text-xs">
								{side.sourceUrl ? (
									<a
										href={side.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="underline underline-offset-2"
									>
										{side.sourceTitle ?? side.sourceUrl}
									</a>
								) : (
									(side.sourceTitle ?? "untitled source")
								)}
								{" · saved "}
								{new Date(side.savedAt).toLocaleDateString()}
							</p>
						</li>
					))}
				</ul>

				<div className="flex flex-wrap items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setComposerDraft(questionFor(dispute));
							router.push("/agent");
						}}
					>
						Ask the copilot
					</Button>
					<Link
						href={`/${dispute.pageSlug}`}
						className="text-muted-foreground text-sm underline underline-offset-2 hover:text-foreground"
					>
						{dispute.pageTitle}
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

function DisputeList() {
	const disputes = useQuery(disputesQueryOptions());

	if (disputes.isPending) {
		return <QuerySkeleton rows={3} className="h-40 rounded-xl" />;
	}

	if (disputes.isError) {
		return <QueryError error={disputes.error} />;
	}

	if (disputes.data.length === 0) {
		return (
			<Empty>
				<EmptyTitle>Nothing disagrees yet</EmptyTitle>
				<EmptyDescription>
					A contradiction appears when a new source contests a claim your
					library has already compiled.
				</EmptyDescription>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{disputes.data.map((dispute) => (
				<DisputeCard key={dispute.claimId} dispute={dispute} />
			))}
		</div>
	);
}

export function DisputesView() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Contradictions">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Where your sources disagree — both sides kept
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<DisputeList />
			</div>
		</div>
	);
}
