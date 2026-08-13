"use client";

import { Empty, EmptyDescription, EmptyTitle } from "@kc/ui/components/empty";
import { Skeleton } from "@kc/ui/components/skeleton";
import { isSignedOut } from "@/lib/api-client";

/**
 * The two states every page here shares, said the same way each time.
 *
 * Signed out is separated from everything else on purpose. It is the reader's
 * own state and has an obvious remedy, whereas an unreachable API is neither —
 * collapsing them into "something went wrong" would send someone to check their
 * account when the service is simply not running.
 */

export function QueryError({ error }: { error: unknown }) {
	const signedOut = isSignedOut(error);
	return (
		<Empty>
			<EmptyTitle>{signedOut ? "Sign in to see this" : "Could not load"}</EmptyTitle>
			<EmptyDescription>
				{signedOut
					? "This belongs to a workspace, so it needs a session."
					: "The API did not answer. It may not be running."}
			</EmptyDescription>
		</Empty>
	);
}

export function QuerySkeleton({
	rows = 3,
	className = "h-24 rounded-xl",
}: {
	rows?: number;
	className?: string;
}) {
	return (
		<div className="flex flex-col gap-3">
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton key={i} className={className} />
			))}
		</div>
	);
}
