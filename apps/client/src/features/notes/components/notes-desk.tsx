"use client";

import {
	ArrowLeft,
	ArrowRight,
	CircleAlert,
	ListFilter,
	Search,
	X,
} from "lucide-react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PageHeader } from "@/components/page-header";

type Note = {
	slug: string;
	title: string;
	summary: string;
	category: string;
	updated: string;
	sources: number;
	claims: number;
	disputed: number;
	links: number;
};

const NOTES: Note[] = [
	{
		slug: "scaling-laws-and-the-bitter-lesson",
		title: "Scaling laws and the bitter lesson",
		summary:
			"Compute and general methods keep beating hand-engineered priors across the fields I have studied.",
		category: "Research",
		updated: "Today, 09:42",
		sources: 6,
		claims: 14,
		disputed: 1,
		links: 8,
	},
	{
		slug: "attention-transformers-and-rnns",
		title: "Attention, transformers, and why they replaced RNNs",
		summary:
			"Self-attention trades recurrence for parallel work. That is the main technical unlock.",
		category: "Research",
		updated: "Yesterday",
		sources: 4,
		claims: 11,
		disputed: 0,
		links: 6,
	},
	{
		slug: "note-linking-systems",
		title: "Note-linking systems: Zettelkasten, second brain, and this wiki",
		summary:
			"Different terms point to the same move: capture one idea, link it, and let structure form over time.",
		category: "Research",
		updated: "2 days ago",
		sources: 5,
		claims: 9,
		disputed: 0,
		links: 12,
	},
	{
		slug: "karpathy-training-recipe",
		title: "Karpathy's neural net training recipe",
		summary: "Become one with the data before you write a line of model code.",
		category: "Reference",
		updated: "Mar 28",
		sources: 2,
		claims: 8,
		disputed: 0,
		links: 4,
	},
	{
		slug: "building-a-second-brain",
		title: "Building a Second Brain: the CODE method",
		summary: "Capture, Organize, Distill, Express.",
		category: "Reference",
		updated: "Mar 24",
		sources: 3,
		claims: 7,
		disputed: 1,
		links: 3,
	},
	{
		slug: "smart-notes-basics",
		title: "How to Take Smart Notes: Zettelkasten basics",
		summary:
			"Keep one idea in each note, link often, and let useful groups emerge.",
		category: "Reference",
		updated: "Mar 21",
		sources: 4,
		claims: 10,
		disputed: 0,
		links: 9,
	},
	{
		slug: "sapphire-wiki-graph",
		title: "Sapphire wiki: link graph design notes",
		summary:
			"Design notes for the graph view, written while using the graph itself.",
		category: "Project",
		updated: "Mar 18",
		sources: 1,
		claims: 6,
		disputed: 0,
		links: 7,
	},
	{
		slug: "tokenizer-quirks",
		title: "Tokenizer quirks to revisit",
		summary:
			"Byte-pair encoding splits numbers in odd ways. This needs more study.",
		category: "Inbox",
		updated: "Mar 17",
		sources: 1,
		claims: 3,
		disputed: 2,
		links: 1,
	},
];

const SECTIONS = [
	{
		heading: "The general pattern",
		body: "When enough compute and data become available, broad learning methods tend to pass systems built from expert rules. The lesson is not that domain knowledge has no value. It is that a method which can keep using more computation has a longer useful life than a fixed set of human assumptions.",
	},
	{
		heading: "Why scale changes the answer",
		body: "Small experiments reward good hand-built features because the general method has not reached its useful range. At larger scales, the same features can become a ceiling. Search and learning continue to improve while a fixed representation does not.",
	},
	{
		heading: "What this changes in practice",
		body: "Prefer systems that can absorb more examples and more computation. Use expert knowledge to shape the task, the data, and the checks. Be careful when it is used to limit the space that the system can learn from.",
	},
];

function NoteMeta({ note }: { note: Note }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
			<span>{note.sources} sources</span>
			<span>{note.claims} claims</span>
			<span>{note.links} links</span>
			{note.disputed > 0 ? (
				<span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
					<CircleAlert className="size-3" />
					{note.disputed} disputed
				</span>
			) : null}
		</div>
	);
}

function NoteRowContent({ note }: { note: Note }) {
	return (
		<>
			<div className="flex items-center justify-between gap-3">
				<span className="notes-eyebrow">{note.category}</span>
				<span className="shrink-0 text-[0.6875rem] text-muted-foreground">
					{note.updated}
				</span>
			</div>
			<h2 className="mt-2.5 font-semibold text-[0.9375rem] leading-snug tracking-[-0.012em]">
				{note.title}
			</h2>
			<p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
				{note.summary}
			</p>
		</>
	);
}

export function NotesDesk() {
	const [selected, setSelected] = useState(NOTES[0]);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const collection = useSearchParams().get("collection");
	const visible = NOTES.filter((note) => {
		const inCollection = collection === null || note.category === collection;
		const text = `${note.title} ${note.summary}`.toLowerCase();
		return inCollection && text.includes(deferredQuery.trim().toLowerCase());
	});
	const preview =
		visible.find((note) => note.slug === selected.slug) ?? visible[0];

	return (
		<>
			<PageHeader title={collection ?? "All Notes"}>
				<label className="notes-search ml-auto">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<span className="sr-only">Search notes</span>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={`Search ${collection?.toLowerCase() ?? "all notes"}`}
					/>
					{query ? (
						<button
							type="button"
							aria-label="Clear search"
							onClick={() => setQuery("")}
							className="notes-press rounded-full p-1 text-muted-foreground hover:bg-foreground/8"
						>
							<X className="size-3.5" />
						</button>
					) : null}
				</label>
			</PageHeader>

			<main className="notes-canvas flex min-h-0 flex-1 overflow-hidden">
				<div className="grid min-h-0 flex-1 md:grid-cols-[minmax(19rem,0.72fr)_minmax(28rem,1.28fr)]">
					<section className="flex min-h-0 flex-col border-foreground/8 border-r">
						<div className="notes-list-toolbar">
							<p className="font-semibold text-sm">
								{collection ?? "Recently changed"}
								<span className="ml-2 font-normal text-muted-foreground">
									{visible.length}
								</span>
							</p>
							<button
								type="button"
								className="notes-press rounded-full p-2 text-muted-foreground hover:bg-foreground/8"
								aria-label="Filter notes"
							>
								<ListFilter className="size-4" />
							</button>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
							{visible.map((note) => (
								<div key={note.slug} className="mb-1.5">
									<Link
										href={`/${note.slug}`}
										className="notes-row notes-press block md:hidden"
									>
										<NoteRowContent note={note} />
									</Link>
									<button
										type="button"
										onClick={() => setSelected(note)}
										className="notes-row notes-press relative hidden w-full overflow-hidden text-left md:block"
										aria-pressed={preview?.slug === note.slug}
									>
										{preview?.slug === note.slug ? (
											<span className="absolute inset-0 rounded-xl border border-foreground/10 bg-background shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_rgba(0,0,0,.05)]" />
										) : null}
										<span className="relative block">
											<NoteRowContent note={note} />
										</span>
									</button>
								</div>
							))}
							{visible.length === 0 ? (
								<div className="grid min-h-48 place-items-center px-6 text-center text-muted-foreground text-sm">
									No notes match “{deferredQuery}”.
								</div>
							) : null}
						</div>
					</section>

					<article className="notes-paper hidden min-h-0 overflow-y-auto overscroll-contain px-8 py-10 md:block xl:px-14">
						{preview ? (
							<div className="mx-auto max-w-2xl">
								<div className="flex items-center justify-between gap-4">
									<span className="notes-category">{preview.category}</span>
									<span className="text-muted-foreground text-xs">
										Updated {preview.updated}
									</span>
								</div>
								<h1 className="notes-display mt-7 text-4xl xl:text-5xl">
									{preview.title}
								</h1>
								<p className="mt-5 text-lg text-muted-foreground leading-relaxed">
									{preview.summary}
								</p>
								<div className="mt-7 border-foreground/10 border-y py-4">
									<NoteMeta note={preview} />
								</div>
								<div className="mt-9 space-y-8">
									{SECTIONS.slice(0, 2).map((section) => (
										<section key={section.heading}>
											<h2 className="font-semibold text-lg tracking-tight">
												{section.heading}
											</h2>
											<p className="mt-2 text-[0.9375rem] text-muted-foreground leading-7">
												{section.body}
											</p>
										</section>
									))}
								</div>
								<Link
									href={`/${preview.slug}`}
									className="notes-open notes-press mt-9"
								>
									Read full note <ArrowRight className="size-4" />
								</Link>
							</div>
						) : null}
					</article>
				</div>
			</main>
		</>
	);
}

export function NoteReader({ slug }: { slug: string }) {
	const note = NOTES.find((item) => item.slug === slug);

	if (!note) {
		notFound();
	}

	return (
		<>
			<PageHeader className="notes-reader-header">
				<Link
					href="/"
					className="notes-press inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-muted-foreground text-sm hover:bg-foreground/8 hover:text-foreground"
					aria-label="Back to all notes"
				>
					<ArrowLeft className="size-4 shrink-0" />
					<span className="truncate">All Notes</span>
				</Link>
			</PageHeader>

			<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background text-foreground">
				<article className="notes-reader mx-auto min-h-full max-w-4xl px-6 py-10 sm:px-10 sm:py-14 lg:px-20 lg:py-20">
					<div className="mx-auto max-w-2xl">
						<div className="flex flex-wrap items-center justify-between gap-4">
							<span className="notes-category notes-category-strong">
								{note.category}
							</span>
							<span className="text-muted-foreground text-xs">
								Updated {note.updated}
							</span>
						</div>

						<h1 className="notes-display mt-8 text-[clamp(2.5rem,8vw,4.5rem)]">
							{note.title}
						</h1>
						<p className="mt-6 text-[1.125rem] text-muted-foreground leading-8 sm:text-xl sm:leading-9">
							{note.summary}
						</p>

						<div className="mt-8 border-foreground/10 border-y py-4">
							<NoteMeta note={note} />
						</div>

						<div className="mt-12 space-y-10">
							{SECTIONS.map((section) => (
								<section key={section.heading}>
									<h2 className="font-semibold text-xl tracking-[-0.02em]">
										{section.heading}
									</h2>
									<p className="mt-3 text-[1rem] text-muted-foreground leading-8">
										{section.body}
									</p>
								</section>
							))}
						</div>
					</div>
				</article>
			</main>
		</>
	);
}
