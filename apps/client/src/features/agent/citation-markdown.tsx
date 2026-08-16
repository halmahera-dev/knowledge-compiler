"use client";

import { cn } from "@kc/ui/lib/utils";
import Link from "next/link";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	defaultRemarkPlugins,
	Streamdown,
	type StreamdownProps,
} from "streamdown";
import { visit } from "unist-util-visit";
import { CITATION_GROUP, type Evidence } from "./copilot-evidence";

/**
 * Turning `[c1]` into something the reader can open.
 *
 * The markers are the whole basis of the product's claim that an answer is
 * checkable, so they are rewritten into real links to the page a claim lives on
 * — inside the markdown pipeline rather than by post-processing HTML, which
 * would mean re-parsing what was just safely parsed.
 *
 * Two constraints, both verified against the installed Streamdown rather than
 * assumed:
 *
 * 1. `remarkPlugins` **replaces** its defaults. Passing a bare `[myPlugin]`
 *    silently removes GFM, so tables stop rendering with no error anywhere. The
 *    defaults are spread back in below.
 *
 * 2. `allowedTags` only extends the sanitize schema while `rehypePlugins` is
 *    left at its default. Passing that prop at all would both strip the custom
 *    tag and drop sanitisation, which is the worse half by far.
 */

const CitationContext = createContext<Evidence | null>(null);

export function CitationProvider({
	evidence,
	children,
}: {
	evidence: Evidence;
	children: ReactNode;
}) {
	return (
		<CitationContext.Provider value={evidence}>
			{children}
		</CitationContext.Provider>
	);
}

/**
 * A link to a page in this workspace, rather than to the internet.
 *
 * Only paths beginning with a single `/` qualify, checked here as well as in
 * the plugin: `//evil.example` is a protocol-relative URL to another host and
 * reads as a path at a glance, which is exactly the confusion worth refusing.
 */
export function isInternalPath(href: string): boolean {
	return /^\/[^/\\]/.test(href) || href === "/";
}

function PageLink({
	href,
	children,
}: {
	href?: string;
	children?: ReactNode;
}) {
	if (!href || !isInternalPath(href)) {
		return <>{children}</>;
	}

	return (
		<Link href={href} className="underline underline-offset-2">
			{children}
		</Link>
	);
}

/**
 * Rewrites `[Title](/slug)` into a `<pagelink>` node.
 *
 * Streamdown's own anchor treats every link as leaving the site: it cancels the
 * navigation, asks "Open external link?", and then `window.open(href,
 * "_blank")`. For a compiled page in this workspace all three are wrong — it is
 * not external, the question is noise, and the answer opens a second tab onto
 * the app the reader is already in.
 *
 * Internal links are moved to their own tag rather than by overriding `a`,
 * because overriding `a` would take genuinely external links out of that safety
 * prompt as well — and those are the ones a model wrote.
 */
function remarkPageLinks() {
	return (tree: unknown) => {
		visit(tree as never, "link", (node: { url?: string; data?: unknown }) => {
			if (!node.url || !isInternalPath(node.url)) return;

			node.data = {
				...(node.data as object | undefined),
				hName: "pagelink",
				hProperties: { href: node.url },
			};
		});
	};
}

/** Rewrites citation markers into a `<citation label="cN">` node. */
function remarkCitations() {
	return (tree: unknown) => {
		visit(
			tree as never,
			"text",
			(node: { value: string }, index: number | undefined, parent: never) => {
				const typedParent = parent as unknown as {
					type: string;
					children: unknown[];
				} | null;
				if (!typedParent || index === undefined) return;
				// Inside a link or a code span the brackets are content, not a marker.
				if (["link", "code", "inlineCode"].includes(typedParent.type)) return;
				if (!CITATION_GROUP.test(node.value)) {
					CITATION_GROUP.lastIndex = 0;
					return;
				}
				CITATION_GROUP.lastIndex = 0;

				const replacements: unknown[] = [];
				let cursor = 0;

				for (const match of node.value.matchAll(CITATION_GROUP)) {
					const at = match.index ?? 0;
					if (at > cursor) {
						replacements.push({
							type: "text",
							value: node.value.slice(cursor, at),
						});
					}
					for (const label of match[1]?.matchAll(/c\d+/g) ?? []) {
						replacements.push({
							// `emphasis` because remark-rehype already knows how to carry
							// it, and honours the hName/hProperties override.
							type: "emphasis",
							children: [],
							data: {
								hName: "citation",
								// Lowercase, single word: rehype-raw round-trips through a
								// parser that lowercases attribute names, and the sanitize
								// schema matches literally.
								hProperties: { label: label[0] },
							},
						});
					}
					cursor = at + match[0].length;
				}

				if (cursor < node.value.length) {
					replacements.push({ type: "text", value: node.value.slice(cursor) });
				}

				typedParent.children.splice(index, 1, ...replacements);
			},
		);
	};
}

function CitationMark({ label }: { label?: string }) {
	const evidence = useContext(CitationContext);
	const claim = label ? evidence?.byLabel.get(label) : undefined;

	if (!claim) {
		// Unresolved, or ambiguous because two searches used the same label. Shown
		// as written rather than dropped: over-citation stays visible, and a
		// citation is never linked to a page it may not belong to.
		return (
			<sup className={cn("font-mono text-muted-foreground text-xs")}>
				[{label}]
			</sup>
		);
	}

	return (
		<sup className="font-mono text-xs">
			<Link
				href={`/${claim.pageSlug}`}
				title={claim.pageTitle}
				className="underline underline-offset-2"
			>
				[{label}]
			</Link>
		</sup>
	);
}

// Both kept at module scope: Streamdown memoizes the component map and the
// plugin chain on identity, so an inline object re-invalidates them on every
// streamed token.
const CITATION_COMPONENTS = {
	citation: CitationMark,
	pagelink: PageLink,
} as unknown as StreamdownProps["components"];

const CITATION_REMARK_PLUGINS = [
	...Object.values(defaultRemarkPlugins),
	remarkCitations,
	remarkPageLinks,
] as StreamdownProps["remarkPlugins"];

const CITATION_ALLOWED_TAGS = {
	citation: ["label"],
	pagelink: ["href"],
};

/** The answer itself, with its citations resolved. */
export function AnswerBody({
	text,
	evidence,
	isStreaming,
}: {
	text: string;
	evidence: Evidence;
	isStreaming: boolean;
}) {
	const value = useMemo(() => text, [text]);

	return (
		<CitationProvider evidence={evidence}>
			<Streamdown
				className="typeset typeset-chat"
				remarkPlugins={CITATION_REMARK_PLUGINS}
				components={CITATION_COMPONENTS}
				allowedTags={CITATION_ALLOWED_TAGS}
				animated={{ animation: "blurIn" }}
				isAnimating={isStreaming}
			>
				{value}
			</Streamdown>
		</CitationProvider>
	);
}
