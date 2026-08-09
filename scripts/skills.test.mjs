/**
 * The Agent Skills in `skills/` are machine-readable, so a machine should check
 * them.
 *
 * They are consumed by tools that parse the frontmatter and match on the
 * description — Claude Code, Cursor, and anything else that speaks the format.
 * A skill whose frontmatter is malformed, whose name does not match its
 * directory, or whose description runs past the limit is one that silently never
 * loads. Prose rots quietly; this makes it fail out loud.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

/** Limits published by cockroachlabs/cockroachdb-skills. */
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

/** Every `<domain>/<skill>/SKILL.md` under skills/. */
function findSkills() {
  const found = [];
  for (const domain of readdirSync(SKILLS)) {
    const domainPath = join(SKILLS, domain);
    if (!statSync(domainPath).isDirectory()) continue;

    for (const skill of readdirSync(domainPath)) {
      const skillPath = join(domainPath, skill);
      if (!statSync(skillPath).isDirectory()) continue;
      found.push({ domain, skill, file: join(skillPath, "SKILL.md") });
    }
  }
  return found;
}

/** The frontmatter block, parsed just enough. A YAML dependency is not worth it. */
function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const fields = {};
  let key = null;
  for (const line of match[1].split(/\r?\n/)) {
    const start = line.match(/^([a-z_]+):\s*(.*)$/);
    if (start) {
      key = start[1];
      fields[key] = start[2];
    } else if (key && line.trim()) {
      // Folded continuation — a long description wraps across lines.
      fields[key] += ` ${line.trim()}`;
    }
  }
  return fields;
}

const skills = findSkills();

describe("agent skills", () => {
  it("there are some", () => {
    assert.ok(skills.length > 0, "no SKILL.md found under skills/");
  });

  for (const { domain, skill, file } of skills) {
    describe(`${domain}/${skill}`, () => {
      const text = readFileSync(file, "utf8");
      const meta = frontmatter(text);

      it("has YAML frontmatter", () => {
        assert.ok(meta, "SKILL.md must open with a --- delimited block");
      });

      it("declares a name matching its directory", () => {
        // The directory is how a tool addresses the skill; a mismatch means the
        // thing that loads and the thing that is named are different.
        assert.equal(meta?.name, skill);
      });

      it("uses the lowercase hyphenated naming the format requires", () => {
        assert.match(skill, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      });

      it("stays inside the published length limits", () => {
        assert.ok(meta.name.length <= MAX_NAME, `name is ${meta.name.length} chars`);
        assert.ok(
          meta.description.length <= MAX_DESCRIPTION,
          `description is ${meta.description.length} chars`,
        );
      });

      it("has a description that says when to use it", () => {
        // Selection is made on this string alone. "CockroachDB migrations" tells
        // an agent nothing about when it applies; the description has to carry
        // the trigger, not the topic.
        assert.ok(meta.description.length > 80, "too short to describe a trigger");
        assert.match(meta.description, /\buse when\b/i);
      });

      it("has a body, not just frontmatter", () => {
        const body = text.slice(text.indexOf("---", 3) + 3).trim();
        assert.ok(body.length > 200, "a skill with no instructions is a stub");
      });
    });
  }
});
