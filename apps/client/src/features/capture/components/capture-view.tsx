"use client";

import { Button } from "@kc/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { Field, FieldLabel } from "@kc/ui/components/field";
import { Input } from "@kc/ui/components/input";
import { Spinner } from "@kc/ui/components/spinner";
import { Textarea } from "@kc/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import type { CreateItemResult } from "@/features/capture/capture-api";
import { createItem, uploadPdf } from "@/features/capture/capture-api";
import { captureKeys } from "@/features/capture/capture-cache";
import { CompileFeed } from "@/features/capture/components/compile-feed";
import { ExtensionPanel } from "@/features/capture/components/extension-panel";
import { isSignedOut } from "@/lib/api-client";

/**
 * Saving something, and seeing what happened to it.
 *
 * Three modes here rather than four: `clip` belongs to the browser extension,
 * which has the page in front of it. The three a person can do from a keyboard
 * are paste, link, and PDF.
 *
 * A duplicate is reported rather than hidden. Re-saving the same article is a
 * no-op server-side, and a silent success would leave the reader waiting for a
 * compile that is never going to run.
 */

const MIN_PASTE_CHARS = 40;

function describeResult(result: CreateItemResult): string {
	if (result.duplicate) {
		const title = result.duplicateOf?.title;
		return title
			? `Already saved — it matches “${title}”.`
			: "Already saved; nothing to compile.";
	}
	if (result.partsQueued > 1) {
		return `Saved. Long enough to split into ${result.partsQueued} compiles.`;
	}
	return "Saved. Compiling now.";
}

export function CaptureView() {
	const [text, setText] = useState("");
	const [title, setTitle] = useState("");
	const [url, setUrl] = useState("");
	const fileInput = useRef<HTMLInputElement>(null);

	const queryClient = useQueryClient();

	const settle = (result: CreateItemResult) => {
		queryClient.invalidateQueries({ queryKey: captureKeys.items() });
		if (result.duplicate) toast.info(describeResult(result));
		else toast.success(describeResult(result));
	};

	const savePaste = useMutation({
		mutationFn: () =>
			createItem({
				captureType: "paste",
				content: text,
				title: title.trim() || undefined,
			}),
		onSuccess: (result) => {
			settle(result);
			if (!result.duplicate) {
				setText("");
				setTitle("");
			}
		},
		onError: (error) => {
			toast.error(
				isSignedOut(error) ? "Sign in to save." : "Could not save that.",
			);
		},
	});

	const saveLink = useMutation({
		mutationFn: () => createItem({ captureType: "link", sourceUrl: url }),
		onSuccess: (result) => {
			settle(result);
			if (!result.duplicate) setUrl("");
		},
		onError: (error) => {
			toast.error(
				isSignedOut(error)
					? "Sign in to save."
					: "That link could not be fetched.",
			);
		},
	});

	const savePdf = useMutation({
		mutationFn: (file: File) => uploadPdf(file),
		onSuccess: (result) => {
			settle(result);
			if (fileInput.current) fileInput.current.value = "";
		},
		onError: (error) => {
			toast.error(
				isSignedOut(error) ? "Sign in to save." : "That PDF could not be read.",
			);
		},
	});

	const busy = savePaste.isPending || saveLink.isPending || savePdf.isPending;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Capture">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Paste, link, or PDF — the compiler decides where it belongs
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<div className="grid gap-4 lg:grid-cols-2" data-tour="capture-modes">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Paste text</CardTitle>
							<CardDescription>
								A passage, a note, or a whole article.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<Field>
								<FieldLabel htmlFor="capture-title">
									Title (optional)
								</FieldLabel>
								<Input
									id="capture-title"
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder="Left blank, one is derived from the text"
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor="capture-text">Text</FieldLabel>
								<Textarea
									id="capture-text"
									rows={8}
									value={text}
									onChange={(event) => setText(event.target.value)}
									placeholder="Paste here…"
								/>
							</Field>

							<div className="flex items-center gap-3">
								<Button
									disabled={busy || text.trim().length < MIN_PASTE_CHARS}
									onClick={() => savePaste.mutate()}
								>
									{savePaste.isPending ? <Spinner /> : null}
									Save and compile
								</Button>
								<span className="text-muted-foreground text-xs">
									{text.trim().length < MIN_PASTE_CHARS
										? `At least ${MIN_PASTE_CHARS} characters`
										: `${text.trim().length.toLocaleString()} characters`}
								</span>
							</div>
						</CardContent>
					</Card>

					<div className="flex flex-col gap-4">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Save a link</CardTitle>
								<CardDescription>
									Fetched and extracted on the server.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<Field>
									<FieldLabel htmlFor="capture-url">URL</FieldLabel>
									<Input
										id="capture-url"
										type="url"
										value={url}
										onChange={(event) => setUrl(event.target.value)}
										placeholder="https://…"
									/>
								</Field>
								<Button
									disabled={busy || !url.trim()}
									onClick={() => saveLink.mutate()}
								>
									{saveLink.isPending ? <Spinner /> : null}
									Fetch and compile
								</Button>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">Upload a PDF</CardTitle>
								<CardDescription>
									Text is extracted; a long document is split into parts.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<Input
									ref={fileInput}
									type="file"
									accept="application/pdf"
									aria-label="PDF file"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file) savePdf.mutate(file);
									}}
									disabled={busy}
								/>
								{savePdf.isPending ? (
									<p className="flex items-center gap-2 text-muted-foreground text-xs">
										<Spinner /> Reading the file…
									</p>
								) : null}
							</CardContent>
						</Card>

						<ExtensionPanel />
					</div>
				</div>

				<CompileFeed />
			</div>
		</div>
	);
}
