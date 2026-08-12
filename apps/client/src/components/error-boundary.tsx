"use client";

import { Button } from "@kc/ui/components/button";
import { catchError, type ErrorInfo } from "next/error";

function ErrorFallback(
	{ title }: { title: string },
	{ error, retry }: ErrorInfo,
) {
	return (
		<div
			className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
			role="alert"
		>
			<div className="min-w-0">
				<p className="font-medium">{title}</p>
				<p className="truncate text-muted-foreground">
					{error instanceof Error ? error.message : "Unknown error"}
				</p>
			</div>
			<Button onClick={() => retry()} size="sm" variant="outline">
				Try again
			</Button>
		</div>
	);
}

export const ErrorBoundary = catchError(ErrorFallback);
