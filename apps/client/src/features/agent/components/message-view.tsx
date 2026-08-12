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
import { Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { MessageInspector } from "@/features/agent/components/message-inspector";
import { Response } from "@/features/agent/components/response";
import { TextShimmer } from "@/features/agent/components/text-shimmer";

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
}: {
	message: UIMessage;
	isStreaming: boolean;
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

	const citations = message.parts
		.filter(
			(part) =>
				part.type === "tool-searchKnowledge" &&
				"state" in part &&
				part.state === "output-available",
		)
		.flatMap(
			(part) =>
				(
					part as unknown as {
						output: { claims: { label: string; pageTitle: string }[] };
					}
				).output.claims,
		);

	const usedTitles = [
		...new Set(
			[...text.matchAll(/\[c(\d+)\]/g)]
				.map((m) => citations.find((c) => c.label === `c${m[1]}`)?.pageTitle)
				.filter((title): title is string => Boolean(title)),
		),
	];

	return (
		<Message align="start" className="group">
			<MessageContent>
				<Bubble variant="ghost">
					<BubbleContent className="flex flex-col gap-2">
						{inspectable && (
							<MessageInspector reasoning={reasoning} tools={tools} />
						)}

						{textParts.map((part, index) => (
							<Response
								isStreaming={isStreaming}
								key={`${message.id}-text-${index}`}
							>
								{part.text}
							</Response>
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

				{usedTitles.length > 0 && (
					<MessageFooter className="flex-wrap gap-1.5">
						{usedTitles.map((title) => (
							<Badge key={title} variant="outline">
								{title}
							</Badge>
						))}
					</MessageFooter>
				)}
			</MessageContent>
		</Message>
	);
}
