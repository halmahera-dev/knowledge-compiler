"use client";

import { cn } from "@kc/ui/lib/utils";
import { Layers } from "lucide-react";
import { useCommunities } from "@/features/graph/hooks/use-communities";
import { communityName, communityStyleFor } from "@/features/graph/style";
import { isSignedOut } from "@/lib/api-client";

/**
 * What each cluster of the workspace's graph is about.
 *
 * The graph groups topics with Louvain, which answers *which nodes belong
 * together* and nothing more — a number on a node, which a reader cannot use.
 * The summariser turns each group into a name and a paragraph, and this is
 * where they are read.
 *
 * Each row carries the cluster's colour and its letter, which is what the
 * canvas paints and labels its nodes with — the swatch is the link between a
 * paragraph here and a patch of colour out there. It earns its place only
 * because the two agree; when the viewer coloured by label instead, a swatch
 * here would have claimed a correspondence the picture did not make.
 */

function PanelShell({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<aside
			aria-label="Cluster themes"
			className={cn(
				"pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden rounded-lg border border-border bg-card/60 shadow-md backdrop-blur-2xl",
				className,
			)}
		>
			<header className="flex items-center gap-2 border-border border-b px-3 py-2.5">
				<Layers aria-hidden="true" className="size-4 text-muted-foreground" />
				<h2 className="font-medium text-sm">Themes</h2>
			</header>
			{children}
		</aside>
	);
}

function Message({ children }: { children: React.ReactNode }) {
	return <p className="px-3 py-4 text-muted-foreground text-xs">{children}</p>;
}

export function GraphThemes({ className }: { className?: string }) {
	const communities = useCommunities();

	if (communities.isPending) {
		return (
			<PanelShell className={className}>
				<Message>Loading…</Message>
			</PanelShell>
		);
	}

	if (communities.isError) {
		// Signed out is the reader's own state and says what to do about it.
		// Anything else is the API being unreachable, which is not their problem
		// to fix and not worth a stack trace on screen.
		const signedOut = isSignedOut(communities.error);
		return (
			<PanelShell className={className}>
				<Message>
					{signedOut
						? "Sign in to see what your graph covers."
						: "Could not load themes right now."}
				</Message>
			</PanelShell>
		);
	}

	if (communities.data.length === 0) {
		return (
			<PanelShell className={className}>
				<Message>
					Clusters appear once a few related things have been saved.
				</Message>
			</PanelShell>
		);
	}

	// Named first, then by size. An unnamed cluster is still listed: it exists in
	// the graph, and a list that quietly dropped it would disagree with the
	// canvas about how many clusters there are.
	const ordered = [...communities.data].sort((a, b) => {
		if (Boolean(a.title) !== Boolean(b.title)) return a.title ? -1 : 1;
		return b.nodeCount - a.nodeCount;
	});

	return (
		<PanelShell className={className}>
			<div className="min-h-0 overflow-y-auto">
				<ul className="divide-y divide-border">
					{ordered.map((theme) => (
						<li key={theme.community} className="px-3 py-2.5">
							<p className="flex items-baseline justify-between gap-2">
								<span className="flex min-w-0 items-baseline gap-2">
									<span
										aria-hidden="true"
										className="size-2.5 shrink-0 translate-y-px rounded-full"
										style={{
											backgroundColor: communityStyleFor(theme.community).fill,
										}}
									/>
									<span className="shrink-0 font-mono text-muted-foreground text-xs">
										{communityName(theme.community)}
									</span>
									<span className="min-w-0 truncate font-medium text-sm">
										{theme.title ?? "Not named yet"}
									</span>
								</span>
								<span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
									{theme.nodeCount}
									{theme.pageCount > 0 ? ` · ${theme.pageCount}p` : null}
								</span>
							</p>

							{theme.summary ? (
								<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
									{theme.summary}
								</p>
							) : (
								<p className="mt-1 text-muted-foreground text-xs">
									Named after the next save that touches it.
								</p>
							)}

							{theme.labels.length > 0 ? (
								<p className="mt-1.5 font-mono text-[10px] text-muted-foreground leading-relaxed">
									{theme.labels.join(" · ")}
								</p>
							) : null}
						</li>
					))}
				</ul>
			</div>
		</PanelShell>
	);
}
