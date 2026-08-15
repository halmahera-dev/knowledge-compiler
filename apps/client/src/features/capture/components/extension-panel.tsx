"use client";

import { buttonVariants } from "@kc/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@kc/ui/components/collapsible";
import { ChevronDown, Download } from "lucide-react";
import { TrustedExtensions } from "@/features/capture/components/trusted-extensions";

/** The Web Store listing, once there is one. Empty until then. */
const STORE_URL = "";

/**
 * The packed folder, built from `apps/extension` by `scripts/pack-extension.mjs`
 * and served out of `public/`. Regenerated on every build rather than committed,
 * so it cannot fall behind the source it came from — a stale extension that
 * loads and then fails to save is worse than no download at all.
 */
const EXTENSION_ZIP = "/knowledge-compiler-extension.zip";

/**
 * Saving from the page you are reading.
 *
 * This sits beside the three capture forms but is not a fourth capture type: it
 * is the tool that performs the first one for you. Clipping happens in the
 * browser, on a page this app never sees, so there is nothing here to fill in —
 * only something to install.
 *
 * There is no "Add to Chrome" button while the extension is unpublished, and
 * that is not an omission. Chrome removed inline installation in version 71 — a
 * page cannot install an extension, and no amount of scripting brings it back.
 * A button that opened instructions instead would be a button that lies about
 * what it does.
 */
export function ExtensionPanel() {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Clip from the browser</CardTitle>
				<CardDescription>
					Save what you are reading — no copying, no switching tabs.
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground text-sm leading-relaxed">
					<li>Click the toolbar icon to clip the readable article.</li>
					<li>Or right-click a selection, the page, or a link.</li>
					<li>
						It lands in whichever workspace is open here, under this account.
					</li>
				</ul>

				{/* A styled anchor, not a Button rendering one: this navigates or
				    downloads, so it has to keep link semantics — middle-click, copy
				    address, and the screen-reader announcement all come with the
				    element, not with the styling. */}
				<a
					className={buttonVariants({ className: "w-fit" })}
					href={STORE_URL || EXTENSION_ZIP}
					{...(STORE_URL
						? { target: "_blank", rel: "noopener noreferrer" }
						: { download: "knowledge-compiler-extension.zip" })}
				>
					<Download />
					{STORE_URL ? "Add to Chrome" : "Download the extension"}
				</a>

				{STORE_URL ? null : (
					// Collapsed by default: these three steps matter once, after the
					// download, and the reader came to this page to save something.
					<Collapsible>
						<CollapsibleTrigger className="group flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground">
							<ChevronDown className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
							Then, once — how to load it
						</CollapsibleTrigger>

						<CollapsibleContent>
							<ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-muted-foreground text-sm leading-relaxed">
								<li>Unzip it somewhere you will not delete by accident.</li>
								<li>
									Open{" "}
									<code className="rounded bg-muted px-1 font-mono text-xs">
										chrome://extensions
									</code>{" "}
									and turn on Developer mode.
								</li>
								<li>
									Choose <span className="text-foreground">Load unpacked</span>{" "}
									and pick the unzipped folder.
								</li>
							</ol>

							<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
								That is all. It already knows this app on{" "}
								<code className="rounded bg-muted px-1 font-mono text-xs">
									localhost
								</code>
								,{" "}
								<code className="rounded bg-muted px-1 font-mono text-xs">
									127.0.0.1
								</code>{" "}
								and the server, and saves to whichever one you have open — no
								address or port to set.
							</p>

							<p className="mt-2 text-muted-foreground/80 text-xs leading-relaxed">
								Chrome does not allow a website to install an extension, or even
								to open its own settings page. Those two steps have to be yours.
							</p>
						</CollapsibleContent>
					</Collapsible>
				)}

				{/* Outside the collapsible: this one is not optional. Without it the
				    extension is refused, and the refusal looks exactly like being
				    signed out. */}
				<TrustedExtensions />
			</CardContent>
		</Card>
	);
}
