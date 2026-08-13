/**
 * The small slice of Markdown the copilot actually writes.
 *
 * Answers came back as plain paragraphs, so `**bold**` rendered as asterisks and
 * a `- ` list ran on as one sentence. This renders the subset the model emits:
 * headings, bullet and numbered lists, bold, italic, inline code — and the thing
 * no Markdown library knows about, the `[c1]` citation markers, which become
 * links to the page each claim came from.
 *
 * Written by hand rather than pulled from a library for exactly that last part:
 * citations interleave with inline formatting, so a library would need a custom
 * text renderer walking its own AST to find them. Doing both in one pass is less
 * code than fighting that.
 *
 * React elements are built directly — never an HTML string — so model output
 * cannot inject markup no matter what it emits. Anything unrecognised falls
 * through as literal text rather than disappearing.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export interface CitationTarget {
  claimId: string;
  pageSlug: string;
  pageTitle: string;
}

/** `[c1]`, `[c2, c3]`, `[c1][c2]` — the shapes the model produces unprompted. */
const CITATION = /\[([^\]]*?c\d+[^\]]*?)\]/g;
/** Bold before italic, so `**x**` is not read as two italics. */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;

function citationLink(label: string, targets: CitationTarget[], key: string): ReactNode {
  const index = Number(label.slice(1)) - 1;
  const target = targets[index];
  if (!target) {
    // A label pointing past what was retrieved is shown as written rather than
    // dropped: silently deleting it would hide that the answer over-cited.
    return (
      <sup key={key} className="font-mono text-micro text-ink-faint">
        [{label}]
      </sup>
    );
  }

  return (
    <sup key={key}>
      <Link
        to="/wiki/$slug"
        params={{ slug: target.pageSlug }}
        title={target.pageTitle}
        className="ml-0.5 font-mono text-micro text-link no-underline hover:text-link-hover hover:underline"
      >
        [{label}]
      </Link>
    </sup>
  );
}

/** Splits a run of text on citation markers, linking each one it can resolve. */
function withCitations(text: string, targets: CitationTarget[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;

  for (const match of text.matchAll(CITATION)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));

    // One bracket may hold several labels: `[c2, c3]`.
    const labels = [...match[1]!.matchAll(/c\d+/g)].map((m) => m[0]);
    for (const label of labels) out.push(citationLink(label, targets, `${key}-c${n++}`));

    last = at + match[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Bold, italic and code, with citations resolved inside the plain runs. */
function inline(text: string, targets: CitationTarget[], key: string): ReactNode[] {
  return text.split(INLINE).flatMap((part, i) => {
    if (!part) return [];
    const k = `${key}-${i}`;

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={k}>{withCitations(part.slice(2, -2), targets, k)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__")) {
      return <strong key={k}>{withCitations(part.slice(2, -2), targets, k)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={k} className="rounded-sm bg-sunken px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={k}>{withCitations(part.slice(1, -1), targets, k)}</em>;
    }
    return withCitations(part, targets, k);
  });
}

const BULLET = /^\s*[-*+]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^(#{1,6})\s+(.*)$/;
/** The `| --- | :--: |` row directly under a table's header. */
const DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** `| a | b |` → `["a", "b"]`, tolerating the optional outer pipes. */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Column alignment, read off the delimiter row's colons. */
function alignments(delimiter: string): ("left" | "center" | "right")[] {
  return cells(delimiter).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

/**
 * Renders a Markdown table.
 *
 * Comparisons are what the model reaches for a table to express — models against
 * parameter counts, tradeoffs against costs — and without this they arrived as a
 * single run-on line of pipes.
 *
 * The table scrolls inside its own container rather than widening the page: a
 * four-column comparison does not fit a phone, and a horizontally scrolling
 * document is worse than a horizontally scrolling table.
 */
function table(lines: string[], targets: CitationTarget[], key: string): ReactNode {
  const align = alignments(lines[1]!);
  const header = cells(lines[0]!);
  const rows = lines.slice(2).map(cells);
  const cls = (i: number) =>
    `border border-rule px-3 py-1.5 text-${align[i] ?? "left"} align-top`;

  return (
    <div key={key} className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} className={`${cls(i)} bg-sunken font-medium`}>
                {inline(cell, targets, `${key}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {/* Padded to the header's width: a short row would otherwise pull
                  the remaining columns left and misalign everything below it. */}
              {header.map((_, i) => (
                <td key={i} className={cls(i)}>
                  {inline(row[i] ?? "", targets, `${key}-r${r}c${i}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders a copilot answer.
 *
 * Blocks are separated by blank lines, which is how the model writes them. Within
 * a block, consecutive list markers group into one list — the model often emits a
 * whole list without blank lines between items.
 */
export function renderMarkdown(text: string, citations: CitationTarget[] = []): ReactNode[] {
  const blocks = text.split(/\n{2,}/);

  return blocks.flatMap((block, b) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return [];

    const heading = lines[0]!.match(HEADING);
    if (heading && lines.length === 1) {
      return (
        <p key={`b${b}`} className="mt-4 font-read text-h3 font-semibold first:mt-0">
          {inline(heading[2]!, citations, `b${b}`)}
        </p>
      );
    }

    // A table is recognised by its delimiter row, not by the pipes: prose can
    // contain a pipe, but only a table has `| --- | --- |` under its header.
    if (lines.length >= 2 && lines[0]!.includes("|") && DELIMITER.test(lines[1]!)) {
      return table(lines, citations, `b${b}`);
    }

    // A block is a list when every line carries a marker; a stray unmarked line
    // means it is prose that merely contains a dash.
    const bulleted = lines.every((l) => BULLET.test(l));
    const numbered = !bulleted && lines.every((l) => NUMBERED.test(l));

    if (bulleted || numbered) {
      const items = lines.map((line, i) => (
        <li key={`b${b}-i${i}`} className="ml-4 list-outside">
          {inline(line.replace(bulleted ? BULLET : NUMBERED, ""), citations, `b${b}-i${i}`)}
        </li>
      ));
      return bulleted ? (
        <ul key={`b${b}`} className="my-2 list-disc space-y-1">
          {items}
        </ul>
      ) : (
        <ol key={`b${b}`} className="my-2 list-decimal space-y-1">
          {items}
        </ol>
      );
    }

    return <p key={`b${b}`}>{inline(lines.join(" "), citations, `b${b}`)}</p>;
  });
}
