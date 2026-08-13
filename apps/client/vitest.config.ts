import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest does not read `paths` from tsconfig, so the `@/` alias every module in
 * this app imports by has to be repeated here. Without it a test importing
 * anything that reaches `@/features/...` fails at resolution rather than on an
 * assertion, which reads as a broken test rather than a missing alias.
 */
export default defineConfig({
	resolve: {
		alias: {
			// `fileURLToPath`, not `.pathname`: on Windows the latter yields
			// "/D:/..." with a leading slash, which resolves to nothing.
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		// Next's build output holds copies of source files; running them twice is
		// at best noise and at worst a test passing against stale code.
		exclude: ["node_modules/**", ".next/**"],
	},
});
