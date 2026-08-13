"use client";

import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@kc/ui/components/input-group";
import { Spinner } from "@kc/ui/components/spinner";
import type { FormEvent } from "react";

export function ChatInput({
	value,
	onChange,
	onSubmit,
	isBusy = false,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isBusy?: boolean;
}) {
	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!value.trim() || isBusy) return;
		onSubmit();
	}

	return (
		<form onSubmit={handleSubmit} className="w-full">
			<InputGroup>
				<InputGroupTextarea
					placeholder="Ask your knowledge base..."
					className="h-14 min-h-14 overflow-hidden px-4 py-3.5"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSubmit(e);
						}
					}}
				/>
				{/* No attachment menu. It offered "Add Photos & Files", "Create
				    Image", "Deep Research" and "Web Search" — none of them wired to
				    anything, and none of them things this copilot can do: it answers
				    from claims this workspace has already compiled, and its only tool
				    is a search over them. Documents are saved on /capture, where they
				    get compiled rather than pasted into a prompt. */}
				<InputGroupAddon align="block-end">
					<InputGroupButton
						type="submit"
						size="icon-sm"
						variant="default"
						className="ml-auto rounded-full"
						disabled={!value.trim() || isBusy}
					>
						{isBusy ? <Spinner /> : <HugeiconsIcon icon={ArrowUp02Icon} />}
						<span className="sr-only">Send</span>
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
