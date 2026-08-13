"use client";

import { Badge } from "@kc/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@kc/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { QueryError, QuerySkeleton } from "@/components/query-states";
import { usageQueryOptions } from "@/features/usage/usage-query-options";

/**
 * What the AI has cost, call by call.
 *
 * Every number here was measured by the service that made the call, not
 * estimated in the browser. The distinction the page has to keep visible is
 * between a cost of zero and a cost that is unknown: a model with no configured
 * rate returns null, and rendering that as "$0.00" would quietly understate the
 * bill. Unknown is shown as a dash and counted separately.
 */

function formatUsd(value: number | null): string {
	if (value === null) return "—";
	// Four decimals: a single call routinely costs less than a tenth of a cent,
	// and two decimals would round almost every row to zero.
	return `$${value.toFixed(4)}`;
}

function formatTokens(value: number | null): string {
	return value === null ? "—" : value.toLocaleString();
}

function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<Card>
			<CardHeader className="gap-1">
				<CardDescription>{label}</CardDescription>
				<CardTitle className="font-mono text-2xl tabular-nums">
					{value}
				</CardTitle>
			</CardHeader>
			{hint ? (
				<CardContent className="pt-0 text-muted-foreground text-xs">
					{hint}
				</CardContent>
			) : null}
		</Card>
	);
}

/**
 * Split from the page shell so the loading and error states can return early.
 * Narrowing `data` through a chain of ternaries inside JSX does not work —
 * TypeScript keeps it possibly-undefined, and the honest fix is the earlier
 * return rather than a non-null assertion.
 */
function UsageBody() {
	const query = useQuery(usageQueryOptions({ days: 30 }));

	if (query.isPending) {
		return <QuerySkeleton rows={4} />;
	}

	if (query.isError) {
		return <QueryError error={query.error} />;
	}

	const { summary, events, total } = query.data;

	return (
		<>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Stat label="Calls" value={summary.calls.toLocaleString()} />
				<Stat
					label="Input tokens"
					value={summary.inputTokens.toLocaleString()}
				/>
				<Stat
					label="Output tokens"
					value={summary.outputTokens.toLocaleString()}
				/>
				<Stat
					label="Estimated cost"
					value={formatUsd(summary.estimatedUsd)}
					hint={
						summary.unpricedCalls > 0
							? `${summary.unpricedCalls} call${
									summary.unpricedCalls === 1 ? "" : "s"
								} had no configured rate, so this is a floor`
							: undefined
					}
				/>
			</div>

			{summary.byOperation.length > 0 ? (
				<Card className="mt-6">
					<CardHeader>
						<CardTitle className="text-base">By operation</CardTitle>
						<CardDescription>
							Which step of the pipeline the spend went to.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Operation</TableHead>
									<TableHead className="text-right">Calls</TableHead>
									<TableHead className="text-right">In</TableHead>
									<TableHead className="text-right">Out</TableHead>
									<TableHead className="text-right">Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.byOperation.map((row) => (
									<TableRow key={row.operation}>
										<TableCell className="font-medium">
											{row.operation}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{row.calls}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{row.inputTokens.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{row.outputTokens.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{formatUsd(row.estimatedUsd)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			) : null}

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">Calls</CardTitle>
					<CardDescription>
						Newest first. {total.toLocaleString()} recorded.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{events.length === 0 ? (
						<Empty>
							<EmptyTitle>Nothing recorded yet</EmptyTitle>
							<EmptyDescription>
								Save something and the compile it triggers will appear here.
							</EmptyDescription>
						</Empty>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>When</TableHead>
									<TableHead>Operation</TableHead>
									<TableHead>Model</TableHead>
									<TableHead className="text-right">In</TableHead>
									<TableHead className="text-right">Out</TableHead>
									<TableHead className="text-right">Latency</TableHead>
									<TableHead className="text-right">Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{events.map((event) => (
									<TableRow key={event.id}>
										<TableCell className="text-muted-foreground text-xs">
											{new Date(event.createdAt).toLocaleString()}
										</TableCell>
										<TableCell className="font-medium">
											{event.operation}
											{event.status !== "ok" ? (
												<Badge variant="destructive" className="ml-2">
													{event.status}
												</Badge>
											) : null}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{event.model}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{formatTokens(event.inputTokens)}
											{event.tokensEstimated ? (
												// Estimated counts come from text length, not from the
												// provider. Marked so a total built on them is not read
												// as measured.
												<span
													title="Estimated from text length"
													className="ml-1 text-muted-foreground"
												>
													~
												</span>
											) : null}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{formatTokens(event.outputTokens)}
										</TableCell>
										<TableCell className="text-right font-mono text-muted-foreground tabular-nums">
											{event.latencyMs === null ? "—" : `${event.latencyMs}ms`}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">
											{formatUsd(event.estimatedUsd)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</>
	);
}

export function UsageView() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="AI Logs">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Every model call this workspace has paid for, last 30 days
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<UsageBody />
			</div>
		</div>
	);
}
