"use client";

import {
	Book02Icon,
	GitCompareIcon,
	HelpCircleIcon,
	Layers01Icon,
	QuoteDownIcon,
	Route01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@kc/ui/components/button";
import { cn } from "@kc/ui/lib/utils";

type ChatSuggestion = {
	label: string;
	prompt: string;
	icon: IconSvgElement;
};

/**
 * Openers the copilot can actually answer.
 *
 * It has exactly one tool: a search over the workspace's compiled claims, plus
 * the list of themes those pages group into. So every prompt here asks about
 * the collection itself or about what the sources say — nothing that would need
 * counting, folder structure, or knowledge from outside the workspace, all of
 * which the agent is instructed to refuse rather than guess at. A suggestion
 * that reliably produces "your notes don't cover this" is a bad suggestion.
 */
const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
	{
		label: "What's in here",
		prompt:
			"Which themes does my workspace cover, and what is each one built from?",
		icon: Layers01Icon,
	},
	{
		label: "Where my sources disagree",
		prompt:
			"Where do my sources contradict each other, and what does each side actually claim?",
		icon: GitCompareIcon,
	},
	{
		label: "Explain a theme",
		prompt:
			"Take the theme my workspace covers most and explain it from my own notes, citing each point.",
		icon: Book02Icon,
	},
	{
		label: "Show me the quotes",
		prompt:
			"What are the strongest claims in my workspace, and what is the verbatim quote behind each one?",
		icon: QuoteDownIcon,
	},
	{
		label: "How the themes connect",
		prompt:
			"What do my notes say about how my main themes relate to one another?",
		icon: Route01Icon,
	},
	{
		label: "What's still open",
		prompt: "What questions do my notes raise but never answer?",
		icon: HelpCircleIcon,
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
