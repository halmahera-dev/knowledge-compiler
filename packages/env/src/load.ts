/**
 * Loads the repository's single `.env`, wherever the process was started from.
 *
 * Two things this has to survive, both learned the hard way:
 *
 * `import "dotenv/config"` resolves against the current working directory,
 * which is only the repository root when a command happens to be run there.
 * `next build` runs in `apps/client`, so the root `.env` was never read and
 * every variable came back undefined — surfacing as "Invalid environment
 * variables" from a package that had nothing to do with the problem.
 *
 * And this is exported as a function that callers invoke, not as a side effect
 * of importing the module. Mastra's bundler drops a side-effect-only import
 * entirely: `import "./load"` vanished from the built output, the `.env` was
 * never read, and the agent died on validation with no sign that the loader had
 * been skipped. A call cannot be dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** The nearest ancestor of `from` that holds a `.env`, if any. */
function findEnvFile(from: string): string | null {
	let dir = from;

	for (;;) {
		const candidate = path.join(dir, ".env");
		if (fs.existsSync(candidate)) return candidate;

		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

let loaded = false;

/**
 * Read the root `.env` into `process.env`, once.
 *
 * Searched by walking up rather than by a fixed number of `..` steps: this
 * module is compiled into other people's bundles, so its own location on disk
 * is not a fixed distance from the root.
 */
export function loadRootEnv(): void {
	if (loaded) return;
	loaded = true;

	// The working directory first: every command here runs at the root or in an
	// app directory below it. This file's own location is the fallback, for a
	// bundle executed from somewhere else.
	const here = path.dirname(fileURLToPath(import.meta.url));
	const envFile = findEnvFile(process.cwd()) ?? findEnvFile(here);

	if (envFile) dotenv.config({ path: envFile, quiet: true });
}
