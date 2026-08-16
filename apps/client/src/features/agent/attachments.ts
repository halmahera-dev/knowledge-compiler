import type { CreateItemResult } from "@/features/capture/capture-api";

/**
 * What became of a file the reader attached.
 *
 * A PDF does not go through the model — binary cannot travel in a prompt, and
 * a file the reader dragged onto the composer is already an explicit "save
 * this", so there is nothing to ask them. It uploads straight to the API, which
 * means the outcome is known exactly and does not need a model call to be
 * described. This turns that outcome into the sentence shown beside the file.
 */

export type AttachmentState = "uploading" | "saved" | "duplicate" | "failed";

export interface Attachment {
	id: string;
	name: string;
	state: AttachmentState;
	detail: string;
}

export function describeUpload(result: CreateItemResult): {
	state: AttachmentState;
	detail: string;
} {
	if (result.duplicate) {
		const title = result.duplicateOf?.title;
		return {
			state: "duplicate",
			// Named rather than just refused: "already saved" with nothing to check
			// is indistinguishable from the upload having failed silently.
			detail: title ? `Already saved as “${title}”` : "Already saved",
		};
	}

	const name = result.title ?? "Saved";

	return {
		state: "saved",
		detail:
			result.partsQueued > 1
				? `${name} — long enough to split into ${result.partsQueued} parts, compiling`
				: `${name} — compiling`,
	};
}
