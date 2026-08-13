"use client";

import { Button } from "@kc/ui/components/button";
import { CloudOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { UnsavedReason } from "@/features/agent/hooks/use-copilot-chat";
import { setComposerDraft } from "@/features/agent/pending-message";

/**
 * The answer arrived, but the workspace has no record of it.
 *
 * Deliberately not an error bubble: that offers to re-ask the model, which
 * bills a second call for what is a storage problem — the answer on screen is
 * fine. This says the one thing the reader needs to know, which is that
 * reloading will lose it, and offers the action that actually fixes each cause.
 */
export function UnsavedTurn({
	reason,
	question,
	onRetry,
}: {
	reason: UnsavedReason;
	question: string;
	onRetry: () => void;
}) {
	const pathname = usePathname();
	const router = useRouter();

	return (
		<span className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
			<CloudOff className="size-3 shrink-0" />

			{reason === "network" ? (
				<>
					Not saved to this workspace.
					<Button
						variant="link"
						size="sm"
						className="h-auto p-0 text-xs"
						onClick={onRetry}
					>
						Retry
					</Button>
				</>
			) : null}

			{reason === "signed-out" ? (
				<>
					Not saved — your session expired.
					<Link
						href={`/login?redirect=${encodeURIComponent(pathname)}`}
						className="underline underline-offset-2 hover:text-foreground"
					>
						Sign in
					</Link>
				</>
			) : null}

			{reason === "no-workspace" ? (
				<>
					Not saved — there is no workspace to keep it in.
					<Link
						href="/workspace/new"
						className="underline underline-offset-2 hover:text-foreground"
					>
						Create one
					</Link>
				</>
			) : null}

			{reason === "gone" ? (
				<>
					This conversation was deleted, so the answer wasn't saved.
					<Button
						variant="link"
						size="sm"
						className="h-auto p-0 text-xs"
						onClick={() => {
							// The question travels to the composer rather than being lost
							// with the thread that no longer exists.
							setComposerDraft(question);
							router.push("/agent");
						}}
					>
						Start a new one
					</Button>
				</>
			) : null}
		</span>
	);
}
