import Link from "next/link";

/**
 * The root-level fallback, outside the signed-in shell.
 *
 * Deliberately plain: it renders for addresses that never reached the app, so
 * it must not assume a session, a workspace, or the sidebar.
 */
export default function NotFound() {
	return (
		<div className="grid min-h-svh place-items-center px-5">
			<div className="max-w-md text-center">
				<h1 className="font-semibold text-2xl tracking-tight">Not found</h1>
				<p className="mt-3 text-muted-foreground leading-relaxed">
					That address doesn&rsquo;t match anything here.
				</p>
				<Link
					href="/"
					className="mt-6 inline-block text-sm underline underline-offset-4"
				>
					Go to your notes
				</Link>
			</div>
		</div>
	);
}
