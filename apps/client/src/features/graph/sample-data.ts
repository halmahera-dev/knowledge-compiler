import type { GraphData, GraphNode, GraphRelationship } from "./types";

function node(
	id: string,
	labels: string[],
	properties: GraphNode["properties"],
): GraphNode {
	return { id, labels, properties };
}

function rel(
	id: string,
	startNodeId: string,
	type: string,
	endNodeId: string,
	properties: GraphRelationship["properties"] = {},
): GraphRelationship {
	return { id, type, startNodeId, endNodeId, properties };
}

/**
 * Karpathy's "LLM wiki": plain markdown notes meant to be queried by an LLM
 * rather than browsed by hand. Each note carries a title, one-sentence
 * summary, timestamps and hashtags, lives in a folder (`inbox/`, `reference/`,
 * `research/`, `projects/`, `meetings/`), and cross-references other notes
 * with `[[wikilinks]]` — the denser that link graph, the more an LLM has to
 * reason over. Reference notes are where daily reading (Reddit, Medium,
 * Substack, Quora, e-books) gets distilled; Research notes are where several
 * of those distillations get synthesized and start linking back to each
 * other, which is what makes old reading resurface instead of getting lost.
 *
 * Shaped like the Neo4j movie graph underneath: folders double as labels for
 * the palette, two notes act as hubs, one pair links both directions, one
 * pair carries two relationship types, and one note revises itself.
 */
export const SAMPLE_GRAPH: GraphData = {
	nodes: [
		// research/ — synthesized across multiple sources, link-heavy
		node("n1", ["Note", "Research"], {
			title: "Scaling laws and the bitter lesson",
			summary:
				"Compute + general methods keep beating hand-engineered priors across everything I've read.",
			created: "2024-01-15",
			updated: "2024-03-22",
		}),
		node("n2", ["Note", "Research"], {
			title: "Attention, transformers, and why they replaced RNNs",
			summary:
				"Self-attention trades recurrence for parallelism — that's the real unlock.",
			created: "2024-01-20",
			updated: "2024-01-25",
		}),
		node("n3", ["Note", "Research"], {
			title:
				"Note-linking systems: Zettelkasten vs. second brain vs. this wiki",
			summary:
				"Different vocab, same core move: capture atomically, link, don't file.",
			created: "2024-02-16",
			updated: "2024-04-02",
		}),

		// reference/ — one note distilled from one external source
		node("n4", ["Note", "Reference"], {
			title: "Karpathy's neural net training recipe",
			summary: "Become one with the data before writing a line of model code.",
			created: "2024-02-02",
			updated: "2024-02-20",
		}),
		node("n5", ["Note", "Reference"], {
			title: "Building a Second Brain — the CODE method",
			summary: "Capture, Organize, Distill, Express.",
			created: "2024-02-10",
		}),
		node("n6", ["Note", "Reference"], {
			title: "How to Take Smart Notes — Zettelkasten basics",
			summary: "One idea per note, link liberally, let structure emerge.",
			created: "2024-02-14",
			updated: "2024-04-01",
		}),
		node("n7", ["Note", "Reference"], {
			title: "Why most startups die (Quora breakdown)",
			summary: "Distribution kills more startups than product does.",
			created: "2024-03-05",
		}),
		node("n12", ["Note", "Reference"], {
			title: "Writing clearly, applied to note-taking",
			summary: "A clear sentence and an atomic note are the same discipline.",
			created: "2024-03-12",
		}),

		// projects/ — tied to something actually being built
		node("n8", ["Note", "Project"], {
			title: "Sapphire wiki — link graph design notes",
			summary:
				"Designing the note-graph visualizer itself; eating my own dog food.",
			created: "2024-03-25",
		}),

		// meetings/ — a discussion, not a solo read
		node("n9", ["Note", "Meeting"], {
			title: "Reading group: How to Take Smart Notes discussion",
			summary:
				"Group mostly argued about whether physical index cards still matter.",
			created: "2024-02-20",
		}),

		// inbox/ — rough captures awaiting triage, deliberately sparse
		node("n10", ["Note", "Inbox"], {
			title: "Reddit thread on tokenizer quirks — revisit later",
			summary: "Byte-pair encoding splits numbers weirdly, need to dig in.",
			created: "2024-03-18",
		}),
		node("n11", ["Note", "Inbox"], {
			title: "Quick note: Quora answer on cofounder equity split",
			summary:
				"50/50 splits often regretted; revisit when thinking about my own project.",
			created: "2024-03-20",
		}),

		// hashtags
		node("t1", ["Tag"], { name: "#deep-learning" }),
		node("t2", ["Tag"], { name: "#llms" }),
		node("t3", ["Tag"], { name: "#pkm" }),
		node("t4", ["Tag"], { name: "#startups" }),
		node("t5", ["Tag"], { name: "#writing" }),

		// the actual articles read day to day, across platforms
		node("s1", ["Source"], {
			title: "ELI5: what is a Transformer model?",
			platform: "Reddit",
			author: "r/MachineLearning",
			url: "https://reddit.com/r/MachineLearning/example",
			publishedYear: 2023,
		}),
		node("s2", ["Source"], {
			title: "A Recipe for Training Neural Networks",
			platform: "Substack",
			author: "Andrej Karpathy",
			url: "https://karpathy.github.io/2019/04/25/recipe/",
			publishedYear: 2019,
		}),
		node("s3", ["Source"], {
			title: "Building a Second Brain (excerpt)",
			platform: "Medium",
			author: "Tiago Forte",
			url: "https://medium.com/example/building-a-second-brain",
			publishedYear: 2022,
		}),
		node("s4", ["Source"], {
			title: "How to Take Smart Notes",
			platform: "E-Book",
			author: "Sönke Ahrens",
			url: "https://example.com/ebooks/how-to-take-smart-notes",
			publishedYear: 2017,
		}),
		node("s5", ["Source"], {
			title: "Why do most startups actually fail?",
			platform: "Quora",
			author: "anonymous",
			url: "https://quora.com/example/why-do-most-startups-fail",
			publishedYear: 2021,
		}),
		node("s6", ["Source"], {
			title: "Notes on writing clearly",
			platform: "Substack",
			author: "Julia Evans",
			url: "https://substack.com/example/notes-on-writing-clearly",
			publishedYear: 2023,
		}),
	],
	relationships: [
		// [[wikilinks]] — the backbone the LLM actually reasons over
		rel("r1", "n1", "LINKS", "n4", {}),
		rel("r2", "n1", "LINKS", "n2", {}),
		// Same pair as r2, opposite direction: a reciprocal wikilink, like
		// SEQUEL_OF/INSPIRED running both ways between the same two movies.
		rel("r3", "n2", "LINKS", "n1", {}),
		rel("r4", "n2", "LINKS", "n4", {}),
		rel("r5", "n3", "LINKS", "n5", {}),
		rel("r6", "n3", "LINKS", "n6", {}),
		// Same pair as r6, a second relationship type, so the arcs have to fan
		// out between them.
		rel("r7", "n3", "EXPANDS", "n6", {
			note: "added a table comparing the three systems",
		}),
		rel("r8", "n8", "LINKS", "n3", {}),
		rel("r9", "n8", "LINKS", "n1", {}),
		rel("r10", "n9", "LINKS", "n6", {}),
		rel("r11", "n12", "LINKS", "n6", {}),
		rel("r12", "n8", "LINKS", "n7", {}),

		// Reference (and one Meeting) notes distilled from an external read
		rel("r13", "n2", "SOURCED_FROM", "s1", {}),
		rel("r14", "n4", "SOURCED_FROM", "s2", {}),
		rel("r15", "n5", "SOURCED_FROM", "s3", {}),
		rel("r16", "n6", "SOURCED_FROM", "s4", {}),
		rel("r17", "n7", "SOURCED_FROM", "s5", {}),
		// Parallel fan-in on s4: the book got a reference note and got discussed
		// live in the reading group.
		rel("r18", "n9", "SOURCED_FROM", "s4", {}),
		rel("r19", "n12", "SOURCED_FROM", "s6", {}),

		// hashtags
		rel("r20", "n1", "TAGGED", "t1", {}),
		rel("r21", "n1", "TAGGED", "t2", {}),
		rel("r22", "n2", "TAGGED", "t1", {}),
		rel("r23", "n2", "TAGGED", "t2", {}),
		rel("r24", "n3", "TAGGED", "t3", {}),
		rel("r25", "n3", "TAGGED", "t5", {}),
		rel("r26", "n4", "TAGGED", "t1", {}),
		rel("r27", "n4", "TAGGED", "t2", {}),
		rel("r28", "n5", "TAGGED", "t3", {}),
		rel("r29", "n6", "TAGGED", "t3", {}),
		rel("r30", "n6", "TAGGED", "t5", {}),
		rel("r31", "n7", "TAGGED", "t4", {}),
		rel("r32", "n8", "TAGGED", "t3", {}),
		rel("r33", "n9", "TAGGED", "t3", {}),
		rel("r34", "n10", "TAGGED", "t2", {}),
		rel("r35", "n11", "TAGGED", "t4", {}),
		rel("r36", "n12", "TAGGED", "t5", {}),

		rel("r37", "t1", "RELATED_TO", "t2", {}),

		// A note revising itself after a reread — the self-relationship, drawn
		// as a loop.
		rel("r38", "n1", "REVISED", "n1", {
			summary:
				"reread in March after forgetting the original argument, expanded with examples from RL",
		}),
	],
};

/**
 * A useful opening view: the most-linked research note and everything one
 * hop from it. The rest of the wiki arrives as the user expands nodes.
 */
export const SAMPLE_SEED_NODE_IDS = ["n1"];
