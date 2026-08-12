import { Badge } from "@kc/ui/components/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { BookOpen, Link2, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SAMPLE_GRAPH } from "@/features/graph/sample-data";
import { primaryLabel } from "@/features/graph/style";
import { NoteActivityChart } from "./note-activity-chart";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Note-to-note reference types; REVISED is a self-loop (a rewrite), not a
// cross-reference, so it's excluded from link counting.
const LINK_TYPES = new Set(["LINKS", "EXPANDS", "REFERENCES"]);

function monthOf(dateString: string): string {
	return MONTHS[new Date(dateString).getUTCMonth()] ?? dateString;
}

function weekIndexOf(dateString: string): number {
	return Math.floor(new Date(dateString).getTime() / WEEK_MS);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

const notes = SAMPLE_GRAPH.nodes.filter((n) => n.labels.includes("Note"));
const sources = SAMPLE_GRAPH.nodes.filter((n) => n.labels.includes("Source"));
const tags = SAMPLE_GRAPH.nodes.filter((n) => n.labels.includes("Tag"));

// 1. KPI row -----------------------------------------------------------

const inboxCount = notes.filter((n) => primaryLabel(n) === "Inbox").length;
const inboxRatio = notes.length > 0 ? inboxCount / notes.length : 0;
const inboxTone =
	inboxRatio >= 0.4 ? "alert" : inboxRatio >= 0.2 ? "warn" : "good";

const createdWeeks = notes
	.map((n) => asString(n.properties.created))
	.filter((v): v is string => v !== undefined)
	.map(weekIndexOf);
const latestWeek = createdWeeks.length > 0 ? Math.max(...createdWeeks) : 0;
const thisWeekCount = createdWeeks.filter((w) => w === latestWeek).length;
const lastWeekCount = createdWeeks.filter((w) => w === latestWeek - 1).length;
const weekDelta = thisWeekCount - lastWeekCount;

const noteToNoteLinks = SAMPLE_GRAPH.relationships.filter(
	(rel) => LINK_TYPES.has(rel.type) && rel.startNodeId !== rel.endNodeId,
);
const avgLinksPerNote =
	notes.length > 0 ? noteToNoteLinks.length / notes.length : 0;

// 2. Created vs. revisited, by month (monthly rather than weekly: the wiki
// only spans ~11 weeks so a weekly bucket is mostly empty — monthly is the
// resolution this data actually supports). -----------------------------

function buildNoteActivity() {
	const buckets = new Map<string, { created: number; updated: number }>();

	function bump(month: string, key: "created" | "updated") {
		const bucket = buckets.get(month) ?? { created: 0, updated: 0 };
		bucket[key] += 1;
		buckets.set(month, bucket);
	}

	for (const note of notes) {
		const created = asString(note.properties.created);
		const updated = asString(note.properties.updated);
		if (created) bump(monthOf(created), "created");
		if (updated) bump(monthOf(updated), "updated");
	}

	return MONTHS.filter((month) => buckets.has(month)).map((month) => {
		const bucket = buckets.get(month);
		return {
			month,
			created: bucket?.created ?? 0,
			updated: bucket?.updated ?? 0,
		};
	});
}

const noteActivity = buildNoteActivity();

export function StatisticsView() {
	return (
		<>
			<PageHeader title="Statistics" />

			<div className="flex flex-col gap-4 p-4">
				<div className="grid grid-cols-2 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs md:grid-cols-4 dark:*:data-[slot=card]:bg-card">
					<Card className="@container/card">
						<CardHeader>
							<CardDescription>Inbox backlog</CardDescription>
							<CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
								{inboxCount}
							</CardTitle>
							<CardAction>
								<Badge
									variant={inboxTone === "alert" ? "destructive" : "outline"}
								>
									{inboxTone === "good" ? <TrendingDown /> : <TrendingUp />}
									{Math.round(inboxRatio * 100)}%
								</Badge>
							</CardAction>
						</CardHeader>
						<CardFooter className="flex-col items-start gap-1.5 text-sm">
							<div className="line-clamp-1 flex gap-2 font-medium">
								{inboxTone === "good"
									? "Inbox under control"
									: "Inbox is piling up"}
								{inboxTone === "good" ? (
									<TrendingDown className="size-4" />
								) : (
									<TrendingUp className="size-4" />
								)}
							</div>
							<div className="text-muted-foreground">
								{inboxCount} of {notes.length} notes still unprocessed
							</div>
						</CardFooter>
					</Card>

					<Card className="@container/card">
						<CardHeader>
							<CardDescription>Notes this week</CardDescription>
							<CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
								{thisWeekCount}
							</CardTitle>
							<CardAction>
								<Badge variant="outline">
									{weekDelta >= 0 ? <TrendingUp /> : <TrendingDown />}
									{weekDelta >= 0 ? "+" : ""}
									{weekDelta}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardFooter className="flex-col items-start gap-1.5 text-sm">
							<div className="line-clamp-1 flex gap-2 font-medium">
								{weekDelta >= 0
									? "Capturing more than last week"
									: "Slower than last week"}
								{weekDelta >= 0 ? (
									<TrendingUp className="size-4" />
								) : (
									<TrendingDown className="size-4" />
								)}
							</div>
							<div className="text-muted-foreground">
								{thisWeekCount} created vs {lastWeekCount} the week before
							</div>
						</CardFooter>
					</Card>

					<Card className="@container/card">
						<CardHeader>
							<CardDescription>Avg links / note</CardDescription>
							<CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
								{avgLinksPerNote.toFixed(2)}
							</CardTitle>
							<CardAction>
								<Badge variant="outline">
									<Link2 />
									{noteToNoteLinks.length}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardFooter className="flex-col items-start gap-1.5 text-sm">
							<div className="line-clamp-1 flex gap-2 font-medium">
								{avgLinksPerNote >= 1
									? "Densely cross-linked"
									: "Mostly standalone notes"}
								<Link2 className="size-4" />
							</div>
							<div className="text-muted-foreground">
								{noteToNoteLinks.length} links across {notes.length} notes
							</div>
						</CardFooter>
					</Card>

					<Card className="@container/card">
						<CardHeader>
							<CardDescription>Tags / sources</CardDescription>
							<CardTitle className="font-semibold @[250px]/card:text-3xl text-2xl tabular-nums">
								{tags.length} / {sources.length}
							</CardTitle>
							<CardAction>
								<Badge variant="outline">
									<BookOpen />
									{sources.length}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardFooter className="flex-col items-start gap-1.5 text-sm">
							<div className="line-clamp-1 flex gap-2 font-medium">
								Reading pulled from {sources.length} sources
								<BookOpen className="size-4" />
							</div>
							<div className="text-muted-foreground">
								{tags.length} hashtags in use across the wiki
							</div>
						</CardFooter>
					</Card>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>
							Are you still capturing, or starting to revisit?
						</CardTitle>
					</CardHeader>
					<CardContent>
						<NoteActivityChart data={noteActivity} />
					</CardContent>
				</Card>
			</div>
		</>
	);
}
