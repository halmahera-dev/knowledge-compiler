import { buttonVariants } from "@kc/ui/components/button";
import { Compass } from "lucide-react";
import Link from "next/link";

/**
 * A URL inside the app that matches nothing.
 *
 * The second paragraph is the part worth keeping: compiled pages are scoped to
 * the workspace they were compiled in, so a page in a workspace you are not a
 * member of is indistinguishable from one that never existed. That is the most
 * common real cause of a 404 here, and without saying so the reader concludes
 * their page was deleted.
 */
export default function AppNotFound() {
	return (
		<div className="mx-auto grid min-h-[60vh] w-full max-w-2xl place-items-center px-5 py-16">
			<div className="w-full">
				<p className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					<Compass className="size-3.5" />
					Nothing here
				</p>

				<h1 className="mt-3 font-semibold text-3xl tracking-tight">
					No such page.
				</h1>

				<p className="mt-4 text-muted-foreground leading-relaxed">
					That address doesn&rsquo;t match anything. If you followed a link to a
					compiled page, it may belong to a different workspace — pages are
					scoped to the workspace they were compiled in, and one you are not a
					member of looks exactly like one that does not exist.
				</p>

				<div className="mt-7 flex flex-wrap items-center gap-3">
					<Link className={buttonVariants()} href="/">
						Back to your notes
					</Link>
					<Link className={buttonVariants({ variant: "ghost" })} href="/agent">
						Save something
					</Link>
				</div>
			</div>
		</div>
	);
}
