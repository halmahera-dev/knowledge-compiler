"use client";

import { Button, buttonVariants } from "@kc/ui/components/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { describeError } from "@/lib/describe-error";

/**
 * What a route shows when it throws.
 *
 * Next 16 hands this `retry`, not `reset` — the prop was renamed, and the old
 * name silently does nothing because it simply is not passed.
 *
 * The reassurance in the second paragraph is load-bearing: this page appears on
 * a URL somebody may have shared, and without it a transient API outage reads as
 * "the product lost my work".
 */
export default function AppError({
	error,
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	return (
		<div className="mx-auto grid min-h-[60vh] w-full max-w-2xl place-items-center px-5 py-16">
			<div className="w-full">
				<p className="flex items-center gap-2 font-medium text-destructive text-xs uppercase tracking-wider">
					<AlertTriangle className="size-3.5" />
					Could not load
				</p>

				<h1 className="mt-3 font-semibold text-3xl tracking-tight">
					This page didn&rsquo;t load.
				</h1>

				<p className="mt-4 text-muted-foreground leading-relaxed">
					Nothing was lost — everything you saved is still stored, and compiling
					continues in the background.
				</p>

				<p className="mt-5 rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-sm leading-relaxed">
					{describeError(error)}
				</p>

				<div className="mt-7 flex flex-wrap items-center gap-3">
					<Button onClick={retry}>Try again</Button>
					<Link
						className={buttonVariants({ variant: "ghost" })}
						href="/capture"
					>
						Back to capture
					</Link>
				</div>
			</div>
		</div>
	);
}
