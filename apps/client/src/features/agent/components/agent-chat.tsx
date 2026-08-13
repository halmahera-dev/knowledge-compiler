"use client";

import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@kc/ui/components/empty";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@kc/ui/components/message-scroller";
import { Skeleton } from "@kc/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { threadQueryOptions } from "@/features/agent/agent-query-options";
import { toUIMessages } from "@/features/agent/chat-api";
import { AgentThreadMenu } from "@/features/agent/components/agent-thread-menu";
import { ChatInput } from "@/features/agent/components/chat-input";
import { ErrorBubble } from "@/features/agent/components/error-bubble";
import { MessageView } from "@/features/agent/components/message-view";
import { PendingBubble } from "@/features/agent/components/pending-bubble";
import {
	assistantText,
	type CopilotUIMessage,
} from "@/features/agent/copilot-evidence";
import { useCopilotChat } from "@/features/agent/hooks/use-copilot-chat";
import {
	hasPendingMessage,
	takePendingMessage,
} from "@/features/agent/pending-message";

function AgentChatInner({
	threadId,
	initialMessages,
}: {
	threadId: string;
	initialMessages: CopilotUIMessage[];
}) {
	const [input, setInput] = useState("");
	const {
		messages,
		sendMessage,
		status,
		error,
		regenerate,
		unsaved,
		retrySave,
	} = useCopilotChat(threadId, initialMessages);
	const isBusy = status === "submitted" || status === "streaming";

	useEffect(() => {
		const pending = takePendingMessage(threadId);
		if (pending) sendMessage({ text: pending });
	}, [threadId, sendMessage]);

	function handleSubmit() {
		const text = input.trim();
		if (!text || isBusy) return;
		setInput("");
		sendMessage({ text });
	}

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<PageHeader>
				<AgentThreadMenu threadId={threadId} />
			</PageHeader>

			<MessageScrollerProvider autoScroll>
				<MessageScroller className="flex-1">
					<MessageScrollerViewport>
						<MessageScrollerContent className="mx-auto w-full max-w-3xl p-6">
							{messages.map((message, index) => {
								const reason = unsaved.get(message.id);
								return (
									<MessageScrollerItem
										key={message.id}
										messageId={message.id}
										scrollAnchor={message.role === "user"}
										className="fade-in-0 slide-in-from-bottom-1 animate-in duration-200"
									>
										<MessageView
											isStreaming={
												status === "streaming" && index === messages.length - 1
											}
											message={message}
											unsaved={
												reason
													? {
															reason,
															// The question this answer belongs to, so a thread
															// that was deleted mid-answer can be restarted
															// without retyping it.
															question: assistantText(messages[index - 1]),
															onRetry: retrySave,
														}
													: undefined
											}
										/>
									</MessageScrollerItem>
								);
							})}

							{status === "submitted" && (
								<MessageScrollerItem
									messageId="pending"
									className="fade-in-0 slide-in-from-bottom-1 animate-in duration-200"
								>
									<PendingBubble />
								</MessageScrollerItem>
							)}

							{status === "error" && error && (
								<MessageScrollerItem
									messageId="error"
									className="fade-in-0 slide-in-from-bottom-1 animate-in duration-200"
								>
									<ErrorBubble error={error} onRetry={() => regenerate()} />
								</MessageScrollerItem>
							)}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton />
				</MessageScroller>
			</MessageScrollerProvider>

			<div className="mx-auto w-full max-w-3xl p-4 pt-0">
				<ChatInput
					onChange={setInput}
					onSubmit={handleSubmit}
					value={input}
					isBusy={isBusy}
				/>
			</div>
		</div>
	);
}

function AgentChatSkeleton() {
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<PageHeader>
				<Skeleton className="h-8 w-32 rounded-full" />
			</PageHeader>
			<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
				<Skeleton className="h-12 w-2/3 self-end rounded-3xl" />
				<Skeleton className="h-16 w-full rounded-2xl" />
			</div>
		</div>
	);
}

export function AgentChat({ threadId }: { threadId: string }) {
	// The conversation already exists — the composer created it to get this id —
	// but it is empty until the pending question is answered. Skipping the fetch
	// saves a round-trip that could only return an empty thread.
	const [isNewThread] = useState(() => hasPendingMessage(threadId));
	const threadQuery = useQuery({
		...threadQueryOptions(threadId),
		enabled: !isNewThread,
	});

	if (isNewThread) {
		return <AgentChatInner threadId={threadId} initialMessages={[]} />;
	}

	if (threadQuery.isPending) {
		return <AgentChatSkeleton />;
	}

	if (threadQuery.isError) {
		return (
			<div className="flex h-full min-h-0 flex-1 flex-col">
				<PageHeader>
					<AgentThreadMenu threadId={threadId} />
				</PageHeader>

				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyTitle>Conversation not found</EmptyTitle>
						<EmptyDescription>
							It may have been deleted, or you no longer have access to it.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<AgentChatInner
			key={threadId}
			threadId={threadId}
			initialMessages={threadQuery.data ? toUIMessages(threadQuery.data) : []}
		/>
	);
}
