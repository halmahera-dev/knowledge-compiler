"use client";

import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@kc/ui/components/dialog";
import { InputGroupButton } from "@kc/ui/components/input-group";
import { ExtensionGuide } from "@/features/settings/components/extension-guide";

/**
 * The clipper, offered from the composer.
 *
 * It belongs beside the paperclip because both answer the same question —
 * "how do I get something in here?" — and the two are different halves of it:
 * the paperclip takes a file you already have, this takes the page you are
 * reading. It used to live on a settings page that nothing in the navigation
 * pointed at, which meant the extension was effectively undiscoverable.
 *
 * The dialog fades rather than appears: it is opened deliberately, mid-thought,
 * over a conversation the reader is coming back to, and a hard cut reads as a
 * navigation away from it.
 */
export function ExtensionDialog() {
	return (
		<Dialog>
			<DialogTrigger
				render={
					<InputGroupButton
						type="button"
						size="icon-sm"
						variant="ghost"
						className="rounded-full"
					/>
				}
			>
				<HugeiconsIcon icon={PuzzleIcon} />
				<span className="sr-only">Clip from the browser</span>
			</DialogTrigger>

			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Clip from the browser</DialogTitle>
					<DialogDescription>
						Save what you are reading — no copying, no switching tabs.
					</DialogDescription>
				</DialogHeader>

				<ExtensionGuide />
			</DialogContent>
		</Dialog>
	);
}
