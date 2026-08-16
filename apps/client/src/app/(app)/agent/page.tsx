"use client";

import { Cursor02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@kc/ui/components/empty";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { createSession } from "@/features/agent/chat-api";
import { AgentThreadMenu } from "@/features/agent/components/agent-thread-menu";
import { ChatInput } from "@/features/agent/components/chat-input";
import { ChatSuggestions } from "@/features/agent/components/chat-suggestions";
import { usePdfAttachments } from "@/features/agent/hooks/use-pdf-attachments";
import {
	setPendingMessage,
	takeComposerDraft,
} from "@/features/agent/pending-message";
import { authClient } from "@/features/user/user-client";
import { isSignedOut } from "@/lib/api-client";

export default function AgentPage() {
	const [input, setInput] = useState("");
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const firstName = session?.user.name.split(" ")[0] ?? "there";

	const [starting, setStarting] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	// Attaching works before a conversation exists: the upload goes straight to
	// the API and has nothing to say to the model, so making the reader start a
	// thread first would be ceremony for its own sake.
	const { attachments, attach, dismiss } = usePdfAttachments();

	// A question rescued from a conversation that was deleted mid-answer. Taken
	// after mount rather than in a state initialiser: sessionStorage does not
	// exist during the prerender, and seeding it on the client only would make
	// the hydrated input disagree with the server's.
	useEffect(() => {
		const draft = takeComposerDraft();
		if (draft) setInput(draft);
	}, []);

	/**
	 * Creates the conversation, then navigates into it.
	 *
	 * The id has to come from the API — it is the route, and the only thing that
	 * makes the URL shareable and reloadable. That costs one round-trip before the
	 * first token, which is why the composer shows a spinner rather than
	 * pretending it has already started.
	 */
	async function handleSubmit() {
		const text = input.trim();
		if (!text || starting) return;

		setStarting(true);
		setProblem(null);
		try {
			const session = await createSession();
			setPendingMessage(session.id, text);
			router.push(`/agent/${session.id}`);
		} catch (error) {
			// The typed question stays in the box. Losing it here would cost the
			// reader the thing they came to say.
			setStarting(false);
			setProblem(
				isSignedOut(error)
					? "Your session has expired. Sign in again to ask."
					: "No workspace is selected, so there is nowhere to keep this conversation.",
			);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<PageHeader>
				<AgentThreadMenu threadId={null} />
			</PageHeader>
			<div className="fade-in-0 slide-in-from-bottom-1 mx-auto flex w-full max-w-3xl flex-1 animate-in flex-col items-center justify-center gap-2 px-4 pb-12 duration-200">
				<Empty className="flex-none space-y-4 border-none">
					<EmptyHeader className="max-w-2xl!">
						<EmptyMedia variant="icon">
							<HugeiconsIcon icon={Cursor02Icon} />
						</EmptyMedia>
						<EmptyTitle className="mb-2 text-4xl">
							Burning midnight tokens, {firstName}?
						</EmptyTitle>
						<EmptyDescription>
							What are we working on today? Press send to start a new
							conversation
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent className="mt-2 max-w-2xl space-y-2">
						<ChatInput
							onChange={setInput}
							onSubmit={handleSubmit}
							value={input}
							isBusy={starting}
							attachments={attachments}
							onAttach={attach}
							onDismissAttachment={dismiss}
						/>
						{problem ? (
							<p className="text-destructive text-sm" role="alert">
								{problem}
							</p>
						) : null}
						<ChatSuggestions onSelect={setInput} />
					</EmptyContent>
				</Empty>
			</div>
		</div>
	);
}
