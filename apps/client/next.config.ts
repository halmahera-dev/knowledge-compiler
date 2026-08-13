import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@kc/ui"],

	async redirects() {
		// Compiled pages moved from /wiki/{slug} to /{slug}. That route is the one
		// people actually share — a link in someone's message from last week has to
		// keep working, so the old shape is kept alive as a permanent redirect
		// rather than deleted. Redirects run before filesystem routing, so these
		// never shadow a real page.
		return [
			{ source: "/wiki", destination: "/", permanent: true },
			{ source: "/wiki/:slug", destination: "/:slug", permanent: true },
		];
	},
};

export default nextConfig;
