"use client";

import { Badge } from "@kc/ui/components/badge";
import { Button } from "@kc/ui/components/button";
import { Card, CardContent } from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { Skeleton } from "@kc/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { dismissGap } from "@/features/gaps/gaps-api";
import { gapsKeys } from "@/features/gaps/gaps-cache";
import { gapsQueryOptions } from "@/features/gaps/gaps-query-options";
import { isSignedOut } from "@/lib/api-client";

/**
 * What the reading assumes but never covers.
 *
 * Open gaps first, then the ones already dealt with. Dismissed gaps stay
 * visible rather than disappearing: a reader who dismissed something by mistake
 * has no other way to find it, and the list is short enough that keeping them
 * costs nothing.
 */

const STATUS_LABEL: Record<string, string> = {
	open: "open",
	dismissed: "dismissed",
	filled: "filled",
};

export function GapsView() {
	const { data, isPending, error } = useQuery(gapsQueryOptions());
	const queryClient = useQueryClient();

	const dismiss = useMutation({
		mutationFn: dismissGap,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: gapsKeys.list() });
		},
		onError: () => {
			toast.error("Could not dismiss that gap.");
		},
	});

	const ordered = data
		? [...data].sort((a, b) => {
				if ((a.status === "open") !== (b.status === "open")) {
					return a.status === "open" ? -1 : 1;
				}
				return b.createdAt.localeCompare(a.createdAt);
			})
		: [];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Gaps">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Prerequisites your reading leans on but never covers
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				{isPending ? (
					<div className="flex flex-col gap-3">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-24 rounded-xl" />
						))}
					</div>
				) : error ? (
					<Empty>
						<EmptyTitle>
							{isSignedOut(error) ? "Sign in to see this" : "Could not load"}
						</EmptyTitle>
						<EmptyDescription>
							{isSignedOut(error)
								? "Gaps belong to a workspace, so they need a session."
								: "The API did not answer. It may not be running."}
						</EmptyDescription>
					</Empty>
				) : ordered.length === 0 ? (
					<Empty>
						<EmptyTitle>No gaps yet</EmptyTitle>
						<EmptyDescription>
							The compiler raises one only when a source clearly assumes
							something you have not saved. None so far is a good sign, not an
							empty page.
						</EmptyDescription>
					</Empty>
				) : (
					<ul className="flex flex-col gap-3">
						{ordered.map((gap) => (
							<li key={gap.id}>
								<Card
									className={gap.status === "open" ? undefined : "opacity-60"}
								>
									<CardContent className="flex items-start gap-4">
										<div className="min-w-0 flex-1">
											<p className="font-medium">{gap.question}</p>
											<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
												{gap.reason}
											</p>

											<div className="mt-2 flex flex-wrap items-center gap-2">
												<Badge
													variant={
														gap.status === "open" ? "default" : "secondary"
													}
												>
													{STATUS_LABEL[gap.status] ?? gap.status}
												</Badge>
												{/* The concept the gap was raised from. Linked when it
														has a compiled page, plain text when it does not —
														a gap can name a topic nothing was written about
														yet, which is often the point. */}
												{gap.nodeLabel && gap.nodeSlug ? (
													<Link
														href={`/${gap.nodeSlug}`}
														className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
													>
														from {gap.nodeLabel}
													</Link>
												) : gap.nodeLabel ? (
													<span className="text-muted-foreground text-xs">
														from {gap.nodeLabel}
													</span>
												) : null}
												<span className="text-muted-foreground text-xs">
													{new Date(gap.createdAt).toLocaleDateString()}
												</span>
											</div>
										</div>

										{gap.status === "open" ? (
											<Button
												variant="outline"
												size="sm"
												disabled={dismiss.isPending}
												onClick={() => dismiss.mutate(gap.id)}
											>
												Dismiss
											</Button>
										) : null}
									</CardContent>
								</Card>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
