"use client";

import { Badge } from "@kc/ui/components/badge";
import { Bubble, BubbleContent } from "@kc/ui/components/bubble";
import { Button } from "@kc/ui/components/button";
import {
	Message,
	MessageContent,
	MessageFooter,
} from "@kc/ui/components/message";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@kc/ui/components/tooltip";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import { AlertTriangle, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { AnswerBody } from "@/features/agent/citation-markdown";
import { ConsultedClaims } from "@/features/agent/components/consulted-claims";
import { MessageInspector } from "@/features/agent/components/message-inspector";
import { TextShimmer } from "@/features/agent/components/text-shimmer";
import { UnsavedTurn } from "@/features/agent/components/unsaved-turn";
import {
	type CopilotUIMessage,
	readEvidence,
} from "@/features/agent/copilot-evidence";
import type { UnsavedReason } from "@/features/agent/hooks/use-copilot-chat";

type MessagePart = UIMessage["parts"][number];
type ToolPart = ToolUIPart | DynamicToolUIPart;
type TextPart = Extract<MessagePart, { type: "text" }>;
type ReasoningPart = Extract<MessagePart, { type: "reasoning" }>;

function isTextPart(part: MessagePart): part is TextPart {
	return part.type === "text";
}

function isReasoningPart(part: MessagePart): part is ReasoningPart {
	return part.type === "reasoning";
}

function isToolPart(part: MessagePart): part is ToolPart {
	return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolName(part: ToolPart) {
	return part.type === "dynamic-tool"
		? part.toolName
		: part.type.replace(/^tool-/, "");
}

export function MessageView({
	message,
	isStreaming,
	unsaved,
}: {
	message: CopilotUIMessage;
	isStreaming: boolean;
	/** Set only when this answer failed to reach the workspace's history. */
	unsaved?: { reason: UnsavedReason; question: string; onRetry: () => void };
}) {
	const isUser = message.role === "user";
	const textParts = message.parts.filter(isTextPart);
	const text = textParts.map((part) => part.text).join("");

	if (isUser) {
		return (
			<Message align="end">
				<MessageContent>
					<Bubble align="end">
						<BubbleContent>{text}</BubbleContent>
					</Bubble>
				</MessageContent>
			</Message>
		);
	}

	const reasoning = message.parts
		.filter(isReasoningPart)
		.map((part) => part.text);
	const tools = message.parts.filter(isToolPart);
	const hasText = textParts.some((part) => part.text.trim().length > 0);
	const runningTool = tools.find(
		(part) =>
			part.state === "input-streaming" || part.state === "input-available",
	);
	const inspectable = reasoning.length + tools.length > 0;

	// One place knows how to read evidence off a message, whether it just streamed
	// or was rebuilt from the workspace's history.
	const evidence = readEvidence(message);

	return (
		<Message align="start" className="group">
			<MessageContent>
				<Bubble variant="ghost">
					<BubbleContent className="flex flex-col gap-2">
						{inspectable && (
							<MessageInspector reasoning={reasoning} tools={tools} />
						)}

						{evidence.blocked ? (
							// Relayed verbatim from the tool: a session that expired, a
							// workspace not selected. Marked as not being an answer from
							// the reader's own material, because it is not one.
							<Badge variant="outline" className="w-fit gap-1.5">
								<AlertTriangle className="size-3" />
								Not answered from your workspace
							</Badge>
						) : evidence.refused && !isStreaming && hasText ? (
							<Badge variant="outline" className="w-fit gap-1.5">
								<AlertTriangle className="size-3" />
								not in your notes
							</Badge>
						) : null}

						{textParts.map((part, index) => (
							<AnswerBody
								key={`${message.id}-text-${index}`}
								text={part.text}
								evidence={evidence}
								isStreaming={isStreaming}
							/>
						))}

						{isStreaming && !hasText && (
							<TextShimmer>
								{runningTool
									? `Running ${toolName(runningTool)}…`
									: "Thinking…"}
							</TextShimmer>
						)}

						{hasText && !isStreaming && (
							<div className="flex starting:translate-y-1 translate-y-0 opacity-100 starting:opacity-0 transition-[opacity,transform] duration-150 ease-out motion-reduce:duration-0">
								<Tooltip>
									<TooltipTrigger
										render={<Button variant="ghost" size="icon-sm" />}
										onClick={() => navigator.clipboard.writeText(text)}
									>
										<Copy className="size-4 text-transparent transition-colors group-hover:text-foreground" />
									</TooltipTrigger>
									<TooltipContent>Copy</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger
										render={<Button variant="ghost" size="icon-sm" />}
									>
										<ThumbsUp className="size-4 text-transparent transition-colors group-hover:text-foreground" />
									</TooltipTrigger>
									<TooltipContent>Good response</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger
										render={<Button variant="ghost" size="icon-sm" />}
									>
										<ThumbsDown className="size-4 text-transparent transition-colors group-hover:text-foreground" />
									</TooltipTrigger>
									<TooltipContent>Bad response</TooltipContent>
								</Tooltip>
							</div>
						)}
					</BubbleContent>
				</Bubble>

				{(evidence.claims.length > 0 || unsaved) && !isStreaming ? (
					<MessageFooter className="flex flex-col items-start gap-1.5">
						{evidence.claims.length > 0 ? (
							<ConsultedClaims evidence={evidence} />
						) : null}
						{unsaved ? (
							<UnsavedTurn
								reason={unsaved.reason}
								question={unsaved.question}
								onRetry={unsaved.onRetry}
							/>
						) : null}
					</MessageFooter>
				) : null}
			</MessageContent>
		</Message>
	);
}
