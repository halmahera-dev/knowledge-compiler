"use client";

import {
	Book02Icon,
	Idea01Icon,
	InboxIcon,
	Link01Icon,
	TimeQuarterPassIcon,
	Unlink01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@kc/ui/components/button";
import { cn } from "@kc/ui/lib/utils";

type ChatSuggestion = {
	label: string;
	prompt: string;
	icon: IconSvgElement;
};

const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
	{
		label: "Triage my inbox",
		prompt:
			"What's still sitting in inbox/, and which folder should each note move to?",
		icon: InboxIcon,
	},
	{
		label: "Find orphan notes",
		prompt: "Which notes have no wikilinks pointing to them?",
		icon: Unlink01Icon,
	},
	{
		label: "Suggest wikilinks",
		prompt:
			"Suggest wikilinks I'm missing between my #llms and #deep-learning notes.",
		icon: Link01Icon,
	},
	{
		label: "Synthesize a research note",
		prompt:
			"Synthesize my reference/ notes on note-taking systems into one research note.",
		icon: Idea01Icon,
	},
	{
		label: "Resurface old reading",
		prompt: "What did I read last month that I never linked to anything?",
		icon: TimeQuarterPassIcon,
	},
	{
		label: "Most-distilled sources",
		prompt: "Which sources have I taken the most notes from, and on what?",
		icon: Book02Icon,
	},
];

export function ChatSuggestions({
	className,
	onSelect,
}: {
	className?: string;
	onSelect: (prompt: string) => void;
}) {
	return (
		<div className={cn("flex flex-wrap justify-center gap-2", className)}>
			{CHAT_SUGGESTIONS.map((suggestion, index) => (
				<Button
					className="fade-in-0 slide-in-from-bottom-1 animate-in rounded-full fill-mode-both duration-300"
					key={suggestion.prompt}
					onClick={() => onSelect(suggestion.prompt)}
					size="sm"
					style={{ animationDelay: `${index * 40}ms` }}
					title={suggestion.prompt}
					type="button"
					variant="outline"
				>
					<HugeiconsIcon
						className="text-muted-foreground"
						icon={suggestion.icon}
					/>
					{suggestion.label}
				</Button>
			))}
		</div>
	);
}
