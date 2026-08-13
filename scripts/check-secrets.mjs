#!/usr/bin/env node
/**
 * Refuses to let a credential reach a commit.
 *
 * Written after the ad-hoc version of this check failed twice in one run, in
 * both directions at once:
 *
 *   It read files from disk. `.mcp.json` holds a real Cloud key and is
 *   gitignored, so it flagged a file git was never going to publish — while a
 *   key inside an already-staged file would have looked the same. What matters
 *   is what is staged, not what is lying around.
 *
 *   It printed and exited 0. Chained after `&&`, that let the commit and the
 *   push proceed underneath the warning. A check that reports without failing is
 *   decoration.
 *
 * So this reads staged content only, and exits non-zero when it finds something.
 *
 * Run directly, or as `pnpm check:secrets`.
 */
import { execFileSync } from "node:child_process";

/**
 * Credential shapes worth stopping for.
 *
 * Deliberately narrow. A scanner that fires on `S3_BUCKET` or a model id teaches
 * people to skim past it, and the next real finding goes past with the rest.
 */
const PATTERNS = [
  { name: "CockroachDB Cloud API key", re: /CCDB1_[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "Bearer JWT", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./ },
  { name: "private key block", re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
];

/**
 * Values that look like keys but are placeholders.
 *
 * `.env.example` and `.mcp.json.example` exist to show the shape, so the shape
 * is exactly what they contain. Matching on the giveaway words rather than
 * exempting whole files keeps a real key from hiding in one.
 */
const PLACEHOLDER = /your_|example|placeholder|xxx+|<[a-z-]+>|changeme|\.\.\./i;

function stagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf8",
  });
  return out.split("\n").map((line) => line.trim()).filter(Boolean);
}

function stagedContent(file) {
  try {
    return execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch {
    // Binary, or removed between listing and reading. Nothing to scan.
    return "";
  }
}

const findings = [];

for (const file of stagedFiles()) {
  const content = stagedContent(file);
  if (!content) continue;

  content.split("\n").forEach((line, index) => {
    for (const { name, re } of PATTERNS) {
      const match = line.match(re);
      if (!match) continue;
      if (PLACEHOLDER.test(match[0])) continue;
      findings.push({ file, line: index + 1, name, hint: `${match[0].slice(0, 10)}…` });
    }
  });
}

if (findings.length === 0) {
  console.log("  No credentials in staged changes.");
  process.exit(0);
}

console.error("\n  Staged changes contain what look like real credentials:\n");
for (const f of findings) {
  console.error(`    ${f.file}:${f.line}  ${f.name}  (${f.hint})`);
}
console.error(
  [
    "",
    "  Unstage them, move the value into the environment, and commit a",
    "  placeholder instead. If one has already been committed anywhere, rotate",
    "  it — removing the line does not remove it from history.",
    "",
  ].join("\n"),
);
process.exit(1);
