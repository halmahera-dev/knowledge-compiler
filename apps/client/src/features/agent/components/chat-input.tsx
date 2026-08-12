"use client";

import { ArrowUp02Icon, AttachmentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@kc/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@kc/ui/components/input-group";
import { Spinner } from "@kc/ui/components/spinner";
import { type FormEvent, useRef } from "react";

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
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!value.trim() || isBusy) return;
		onSubmit();
	}

	return (
		<form onSubmit={handleSubmit} className="w-full">
			<input ref={fileInputRef} type="file" multiple className="hidden" />
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
				<InputGroupAddon align="block-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<InputGroupButton
									aria-label="Add files"
									type="button"
									size="icon-sm"
									variant="outline"
								>
									<HugeiconsIcon icon={AttachmentIcon} />
								</InputGroupButton>
							}
						/>
						<DropdownMenuContent align="start" side="top" className="w-44">
							<DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
								Add Photos & Files
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem>Create Image</DropdownMenuItem>
							<DropdownMenuItem>Deep Research</DropdownMenuItem>
							<DropdownMenuItem>Web Search</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

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
