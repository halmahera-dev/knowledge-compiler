"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@kc/ui/components/collapsible";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Evidence } from "@/features/agent/copilot-evidence";

/**
 * Everything the answer was built from, cited or not.
 *
 * The distinction is the point: the copilot consults far more than it cites, and
 * showing only the citations would hide what it looked at and rejected. "12
 * consulted, 3 cited" is a fact about how much the answer rests on, and a reader
 * checking a conclusion needs both halves.
 *
 * Collapsed by default — it is evidence, not the answer.
 */
export function ConsultedClaims({ evidence }: { evidence: Evidence }) {
	const cited = new Set(evidence.citations.map((c) => c.claimId));

	return (
		<Collapsible className="w-full">
			<CollapsibleTrigger className="group flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground">
				{/* Base UI's trigger carries `data-panel-open`, not a `data-state`. */}
				<ChevronDown className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
				{evidence.citations.length} cited · {evidence.claims.length} consulted
			</CollapsibleTrigger>

			<CollapsibleContent>
				<ul className="mt-2 flex flex-col gap-3 border-border border-l pl-3">
					{evidence.claims.map((claim) => (
						<li key={claim.claimId} className="text-sm">
							<p className="flex flex-wrap items-baseline gap-2">
								<span className="min-w-0">{claim.text}</span>
								{cited.has(claim.claimId) ? (
									<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
										cited
									</span>
								) : null}
								{claim.status === "disputed" ? (
									<span className="font-mono text-[10px] text-destructive uppercase tracking-wider">
										disputed
									</span>
								) : null}
							</p>

							{claim.quote ? (
								// The verbatim sentence from the source. This is what makes a
								// claim checkable rather than merely attributed.
								<blockquote className="mt-1 text-muted-foreground italic leading-relaxed">
									“{claim.quote}”
								</blockquote>
							) : null}

							<Link
								href={`/${claim.pageSlug}`}
								className="mt-1 inline-block text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
							>
								{claim.pageTitle}
							</Link>
						</li>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	);
}
