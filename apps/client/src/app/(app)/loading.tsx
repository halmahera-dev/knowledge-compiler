/**
 * Shown while a route segment suspends.
 *
 * Invisible for its first 120ms — see `kc-pending-in` in index.css. A navigation
 * that resolves quickly, which is most of them once Next has prefetched, then
 * never flashes a spinner on the way. The retired app bought the same behaviour
 * with a router option; here it costs one animation.
 */
export default function AppLoading() {
	return (
		<div className="kc-pending grid min-h-[40vh] place-items-center px-5">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
				Loading…
			</p>
		</div>
	);
}
