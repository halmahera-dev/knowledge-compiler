"use client";

import { Button } from "@kc/ui/components/button";
import { Input } from "@kc/ui/components/input";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	listMyExtensionOrigins,
	trustExtension,
	untrustExtension,
} from "@/features/capture/extension-origin-actions";

/**
 * The extensions this reader has vouched for.
 *
 * Chrome gives every unpacked install its own id, so the allowlist cannot be
 * configuration — one env value trusts exactly one machine, and the id changes
 * again the moment the folder is repacked. Pasting it here is the one step that
 * cannot be automated: only the person looking at chrome://extensions can see
 * which id is theirs.
 *
 * It is also the security boundary. A malicious extension cannot add itself,
 * because adding requires this form and this form requires their session.
 */
export function TrustedExtensions() {
	const [origins, setOrigins] = useState<string[]>([]);
	const [value, setValue] = useState("");
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		listMyExtensionOrigins().then(setOrigins);
	}, []);

	function submit() {
		const input = value.trim();
		if (!input || pending) return;

		startTransition(async () => {
			const result = await trustExtension(input);

			if (!result.ok) {
				toast.error(result.message);
				return;
			}

			setValue("");
			setOrigins(await listMyExtensionOrigins());
			toast.success("This extension can now save to your workspace.");
		});
	}

	function remove(origin: string) {
		startTransition(async () => {
			await untrustExtension(origin);
			setOrigins(await listMyExtensionOrigins());
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<p className="font-medium text-sm">Trust your copy</p>
			<p className="text-muted-foreground text-sm leading-relaxed">
				Chrome gives every unpacked extension its own id. Copy the{" "}
				<span className="text-foreground">ID</span> from its card on{" "}
				<code className="rounded bg-muted px-1 font-mono text-xs">
					chrome://extensions
				</code>{" "}
				and paste it here, or clipping will be refused.
			</p>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
						}
					}}
					placeholder="abcdefghijklmnopabcdefghijklmnop"
					aria-label="Extension id"
					className="max-w-xs font-mono text-xs"
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={!value.trim() || pending}
					onClick={submit}
				>
					Trust
				</Button>
			</div>

			{origins.length > 0 ? (
				<ul className="mt-1 flex flex-col gap-1">
					{origins.map((origin) => (
						<li
							key={origin}
							className="flex items-center gap-2 text-muted-foreground text-xs"
						>
							<code className="truncate font-mono">{origin}</code>
							<Button
								variant="link"
								size="sm"
								className="h-auto p-0 text-xs"
								disabled={pending}
								onClick={() => remove(origin)}
							>
								Remove
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
