"use client";

import {
	ArrowUp02Icon,
	Attachment01Icon,
	Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@kc/ui/components/input-group";
import { Spinner } from "@kc/ui/components/spinner";
import { cn } from "@kc/ui/lib/utils";
import type { DragEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import type { Attachment } from "@/features/agent/attachments";

/**
 * The composer, which is now also the way things get saved.
 *
 * Two routes in, because they are not the same act. A link or a passage is
 * TEXT: it goes to the copilot, which asks whether to keep it, because a link
 * someone is asking a question about is not a link they want stored. A file is
 * not text — binary cannot travel through a prompt — and dragging one onto the
 * composer is already an unambiguous "save this", so it uploads directly and
 * nothing is asked.
 */

function AttachmentChip({
	attachment,
	onDismiss,
}: {
	attachment: Attachment;
	onDismiss: (id: string) => void;
}) {
	const failed = attachment.state === "failed";

	return (
		<li
			className={cn(
				"flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
				failed ? "border-destructive/40" : "border-border",
			)}
		>
			{attachment.state === "uploading" ? <Spinner className="size-3" /> : null}

			<span className="truncate font-medium">{attachment.name}</span>
			<span
				className={cn(
					"truncate",
					failed ? "text-destructive" : "text-muted-foreground",
				)}
			>
				{attachment.detail}
			</span>

			<button
				type="button"
				onClick={() => onDismiss(attachment.id)}
				className="ml-auto text-muted-foreground hover:text-foreground"
			>
				<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
				<span className="sr-only">Dismiss {attachment.name}</span>
			</button>
		</li>
	);
}

export function ChatInput({
	value,
	onChange,
	onSubmit,
	isBusy = false,
	attachments = [],
	onAttach,
	onDismissAttachment,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isBusy?: boolean;
	attachments?: Attachment[];
	onAttach?: (files: File[]) => void;
	onDismissAttachment?: (id: string) => void;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	// Counted rather than toggled: dragging over a child fires dragleave on the
	// parent, so a boolean flickers the highlight off while the pointer is still
	// inside the composer.
	const dragDepth = useRef(0);

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!value.trim() || isBusy) return;
		onSubmit();
	}

	function take(files: FileList | null) {
		const list = Array.from(files ?? []);
		if (list.length > 0) onAttach?.(list);
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragDepth.current = 0;
		setIsDragging(false);
		take(event.dataTransfer.files);
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="w-full"
			data-tour="chat-input"
			onDragEnter={(event) => {
				event.preventDefault();
				dragDepth.current += 1;
				if (onAttach) setIsDragging(true);
			}}
			onDragOver={(event) => event.preventDefault()}
			onDragLeave={() => {
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) setIsDragging(false);
			}}
			onDrop={handleDrop}
		>
			{attachments.length > 0 ? (
				<ul className="mb-2 flex flex-col gap-1.5">
					{attachments.map((attachment) => (
						<AttachmentChip
							key={attachment.id}
							attachment={attachment}
							onDismiss={(id) => onDismissAttachment?.(id)}
						/>
					))}
				</ul>
			) : null}

			<InputGroup
				className={cn(
					isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background",
				)}
			>
				<InputGroupTextarea
					placeholder={
						onAttach
							? "Ask, or paste a link or an article to save…"
							: "Ask your knowledge base..."
					}
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
					{onAttach ? (
						<>
							<input
								ref={fileInput}
								type="file"
								accept="application/pdf"
								multiple
								className="hidden"
								onChange={(event) => {
									take(event.target.files);
									// Cleared so re-attaching the same file fires change again.
									event.target.value = "";
								}}
							/>
							<InputGroupButton
								type="button"
								size="icon-sm"
								variant="ghost"
								className="rounded-full"
								onClick={() => fileInput.current?.click()}
							>
								<HugeiconsIcon icon={Attachment01Icon} />
								<span className="sr-only">Attach a PDF</span>
							</InputGroupButton>
						</>
					) : null}

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
