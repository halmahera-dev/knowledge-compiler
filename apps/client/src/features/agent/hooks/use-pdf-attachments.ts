"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	type Attachment,
	describeUpload,
} from "@/features/agent/attachments";
import { uploadPdf } from "@/features/capture/capture-api";
import { captureKeys } from "@/features/capture/capture-cache";
import { isSignedOut } from "@/lib/api-client";

/**
 * Files dropped on the composer, and what happened to them.
 *
 * Not a mutation per file: several can be in flight at once and each needs its
 * own row, which a single `useMutation` cannot represent — its `isPending` is
 * one boolean for the whole hook.
 *
 * Deliberately not persisted. This is a receipt for an action taken seconds
 * ago, not part of the conversation: the durable record is the compiled page,
 * and the activity feed on the home page is where a save is followed properly.
 */
export function usePdfAttachments() {
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const queryClient = useQueryClient();

	const settle = useCallback((id: string, patch: Partial<Attachment>) => {
		setAttachments((current) =>
			current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		);
	}, []);

	const attach = useCallback(
		async (files: File[]) => {
			const pdfs = files.filter(
				(file) =>
					file.type === "application/pdf" ||
					file.name.toLowerCase().endsWith(".pdf"),
			);

			const rejected = files.length - pdfs.length;
			if (rejected > 0) {
				setAttachments((current) => [
					...current,
					{
						// Not silently dropped: a reader who dragged a .docx and saw
						// nothing happen would reasonably conclude the app is broken.
						id: `rejected-${current.length}-${files.length}`,
						name:
							rejected === 1 ? "That file" : `${rejected} of those files`,
						state: "failed",
						detail: "Only PDFs can be attached. Paste the text instead.",
					},
				]);
			}

			await Promise.all(
				pdfs.map(async (file, index) => {
					const id = `${file.name}-${file.size}-${index}-${attachments.length}`;

					setAttachments((current) => [
						...current,
						{ id, name: file.name, state: "uploading", detail: "Reading…" },
					]);

					try {
						const result = await uploadPdf(file);
						settle(id, describeUpload(result));
						// The activity feed reads runs, not items, but a fresh save adds
						// to both and the reader may already be watching the feed.
						queryClient.invalidateQueries({ queryKey: captureKeys.items() });
						queryClient.invalidateQueries({ queryKey: captureKeys.runs() });
					} catch (error) {
						settle(id, {
							state: "failed",
							detail: isSignedOut(error)
								? "Sign in again to save."
								: "That PDF could not be read — it may be scanned images with no text layer.",
						});
					}
				}),
			);
		},
		[attachments.length, queryClient, settle],
	);

	const dismiss = useCallback((id: string) => {
		setAttachments((current) => current.filter((item) => item.id !== id));
	}, []);

	return { attachments, attach, dismiss };
}
