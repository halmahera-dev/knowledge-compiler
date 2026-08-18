"use client";

import { buttonVariants } from "@kc/ui/components/button";
import { Download } from "lucide-react";
import { TrustedExtensions } from "@/features/settings/components/trusted-extensions";

/** The Web Store listing, once there is one. Empty until then. */
const STORE_URL = "";

/**
 * The packed folder, built from `apps/extension` by `scripts/pack-extension.mjs`
 * and served out of `public/`. Regenerated on every build rather than committed,
 * so it cannot fall behind the source it came from — a stale extension that
 * loads and then fails to save is worse than no download at all.
 */
const EXTENSION_ZIP = "/traversa-extension.zip";

/**
 * Installing the clipper, and letting this account accept it.
 *
 * The content only — no card, no dialog. It is shown in both, and a reader who
 * met it in one and then the other should not have to work out whether they are
 * looking at the same thing.
 *
 * The steps are laid out rather than folded away. They used to sit behind a
 * collapsible on a page someone had navigated to on purpose; opened from the
 * composer, this is a modal the reader asked for and will close again in thirty
 * seconds, and hiding two thirds of it behind a second click is a strange thing
 * to do to someone who just said "show me".
 */
export function ExtensionGuide() {
	return (
		<div className="flex flex-col gap-5">
			<ol className="flex list-decimal flex-col gap-2 pl-4 text-muted-foreground text-sm leading-relaxed marker:text-muted-foreground/60">
				<li>
					{/* A styled anchor, not a Button rendering one: this downloads, so
					    it has to keep link semantics — middle-click, copy address, and
					    the screen-reader announcement all come with the element, not
					    with the styling. */}
					<a
						className={buttonVariants({
							size: "sm",
							className: "my-1 w-fit",
						})}
						href={STORE_URL || EXTENSION_ZIP}
						{...(STORE_URL
							? { target: "_blank", rel: "noopener noreferrer" }
							: { download: "traversa-extension.zip" })}
					>
						<Download className="size-4" />
						{STORE_URL ? "Add to Chrome" : "Download the extension"}
					</a>
					<span className="block">
						Unzip it somewhere you will not delete by accident.
					</span>
				</li>
				<li>
					Open{" "}
					<code className="rounded bg-muted px-1 font-mono text-xs">
						chrome://extensions
					</code>{" "}
					and turn on Developer mode.
				</li>
				<li>
					Choose <span className="text-foreground">Load unpacked</span> and pick
					the unzipped folder.
				</li>
			</ol>

			{/* Not optional, and not folded away with the rest. Without it every
			    clip is refused, and the refusal looks exactly like being signed
			    out — which sends people to fix the one thing that is already
			    working. */}
			<TrustedExtensions />

			<p className="text-muted-foreground text-sm leading-relaxed">
				There is no address to configure. The extension already knows this app
				on{" "}
				<code className="rounded bg-muted px-1 font-mono text-xs">localhost</code>{" "}
				and at{" "}
				<code className="rounded bg-muted px-1 font-mono text-xs">
					traversa.halmahera.site
				</code>
				, and saves to whichever one you have open.
			</p>

			<p className="text-muted-foreground/80 text-xs leading-relaxed">
				Chrome does not allow a website to install an extension, or even to open
				its own settings page. Those two steps have to be yours.
			</p>
		</div>
	);
}
