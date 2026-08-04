/**
 * Rendering a copilot answer.
 *
 * Answers arrived as plain paragraphs, so `**bold**` reached the page as literal
 * asterisks and a bulleted list ran together into one sentence.
 *
 * These assert on the element tree rather than on HTML, which is also the point:
 * the renderer builds React elements and never an HTML string, so nothing the
 * model emits can inject markup. The cases below are the shapes it actually
 * produces — including the malformed ones, which must degrade to text rather
 * than vanish.
 */
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { renderMarkdown, type CitationTarget } from "./markdown";

const TARGETS: CitationTarget[] = [
  { claimId: "id-1", pageSlug: "eliza", pageTitle: "ELIZA" },
  { claimId: "id-2", pageSlug: "perceptron", pageTitle: "Perceptron" },
];

/** Every element type in the tree, depth first — the structure, not the markup. */
function types(nodes: ReactNode): string[] {
  const out: string[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isValidElement(node)) return;
    const el = node as { type: unknown; props: { children?: ReactNode } };
    out.push(typeof el.type === "string" ? el.type : "Link");
    walk(el.props.children);
  };
  walk(nodes);
  return out;
}

/** All plain text in the tree, joined — what a reader would actually see. */
function text(nodes: ReactNode): string {
  let out = "";
  const walk = (node: ReactNode) => {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") {
      out += node;
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (isValidElement(node)) walk((node as { props: { children?: ReactNode } }).props.children);
  };
  walk(nodes);
  return out;
}

describe("renderMarkdown", () => {
  describe("emphasis", () => {
    it("renders **bold** as bold rather than as asterisks", () => {
      // The regression: this reached the page as literal `**ELIZA**`.
      const tree = renderMarkdown("**ELIZA**: one of the first chatbots.");
      expect(types(tree)).toContain("strong");
      expect(text(tree)).toBe("ELIZA: one of the first chatbots.");
    });

    it("renders __bold__ too", () => {
      expect(types(renderMarkdown("__x__"))).toContain("strong");
    });

    it("renders *italic* and _italic_", () => {
      expect(types(renderMarkdown("*a*"))).toContain("em");
      expect(types(renderMarkdown("_a_"))).toContain("em");
    });

    it("does not read **bold** as two italics", () => {
      const tree = renderMarkdown("**a**");
      expect(types(tree)).toContain("strong");
      expect(types(tree)).not.toContain("em");
    });

    it("renders `code` in a code element", () => {
      expect(types(renderMarkdown("use `npm run dev`"))).toContain("code");
    });

    it("leaves an unclosed marker as text rather than swallowing the rest", () => {
      expect(text(renderMarkdown("a ** dangling"))).toBe("a ** dangling");
    });
  });

  describe("blocks", () => {
    it("turns a run of dashes into one list, not one sentence", () => {
      // The other half of the regression: these ran together on one line.
      const tree = renderMarkdown("- ELIZA\n- Perceptron\n- Neocognitron");
      expect(types(tree).filter((t) => t === "ul")).toHaveLength(1);
      expect(types(tree).filter((t) => t === "li")).toHaveLength(3);
    });

    it("renders a numbered list as ordered", () => {
      const tree = renderMarkdown("1. first\n2. second");
      expect(types(tree)).toContain("ol");
      expect(types(tree).filter((t) => t === "li")).toHaveLength(2);
    });

    it("treats prose containing a dash as prose", () => {
      // "a - b" is a sentence, not a list, and must not become one.
      const tree = renderMarkdown("RNNs suffer vanishing gradients - LSTMs fixed that.");
      expect(types(tree)).toContain("p");
      expect(types(tree)).not.toContain("ul");
    });

    it("separates blocks on blank lines", () => {
      expect(types(renderMarkdown("one\n\ntwo")).filter((t) => t === "p")).toHaveLength(2);
    });

    it("renders a heading distinctly from a paragraph", () => {
      expect(text(renderMarkdown("## History"))).toBe("History");
    });

    it("returns nothing for empty input rather than an empty paragraph", () => {
      expect(renderMarkdown("")).toHaveLength(0);
      expect(renderMarkdown("   \n\n  ")).toHaveLength(0);
    });
  });

  describe("citations", () => {
    it("links a marker to the page its claim came from", () => {
      const tree = renderMarkdown("ELIZA was rule-based [c1].", TARGETS);
      expect(types(tree)).toContain("Link");
      expect(text(tree)).toContain("[c1]");
    });

    it("links every label in a grouped marker", () => {
      const tree = renderMarkdown("Both agree [c1, c2].", TARGETS);
      expect(types(tree).filter((t) => t === "Link")).toHaveLength(2);
    });

    it("links markers inside bold text", () => {
      // Citations interleave with formatting, which is why this is one pass.
      const tree = renderMarkdown("**ELIZA [c1]** was first.", TARGETS);
      expect(types(tree)).toContain("strong");
      expect(types(tree)).toContain("Link");
    });

    it("shows an over-cited label as written rather than dropping it", () => {
      // Deleting it would hide that the answer cited something not retrieved.
      const tree = renderMarkdown("As shown [c9].", TARGETS);
      expect(types(tree)).not.toContain("Link");
      expect(text(tree)).toContain("[c9]");
    });

    it("leaves ordinary brackets alone", () => {
      const tree = renderMarkdown("the paper [see appendix] says so.", TARGETS);
      expect(types(tree)).not.toContain("Link");
      expect(text(tree)).toContain("[see appendix]");
    });

    it("renders markers as plain text when nothing was retrieved", () => {
      expect(text(renderMarkdown("Shown [c1].", []))).toContain("[c1]");
    });
  });

  describe("tables", () => {
    const TABLE = [
      "| Model | Params | Licence |",
      "| --- | ---: | :---: |",
      "| Llama 3 | 70B | Open |",
      "| Mixtral | 8x22B | Apache 2.0 |",
    ].join("\n");

    it("renders a table instead of a line of pipes", () => {
      // The regression: this arrived as one run-on paragraph of `|` characters.
      const shape = types(renderMarkdown(TABLE));
      expect(shape).toContain("table");
      expect(shape.filter((t) => t === "th")).toHaveLength(3);
      expect(shape.filter((t) => t === "tr")).toHaveLength(3);
      expect(text(renderMarkdown(TABLE))).not.toContain("|");
    });

    it("keeps every cell", () => {
      const rendered = text(renderMarkdown(TABLE));
      for (const cell of ["Model", "Llama 3", "8x22B", "Apache 2.0"]) {
        expect(rendered).toContain(cell);
      }
    });

    it("tolerates missing outer pipes", () => {
      const loose = "Model | Params\n--- | ---\nLlama 3 | 70B";
      expect(types(renderMarkdown(loose))).toContain("table");
    });

    it("pads a short row rather than shifting the columns left", () => {
      // A ragged row would otherwise misalign everything below it.
      const ragged = "| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |";
      expect(types(renderMarkdown(ragged)).filter((t) => t === "td")).toHaveLength(3);
    });

    it("resolves citations inside cells", () => {
      const cited = "| Model | Note |\n| --- | --- |\n| ELIZA | rule-based [c1] |";
      expect(types(renderMarkdown(cited, TARGETS))).toContain("Link");
    });

    it("renders emphasis inside cells", () => {
      const bolded = "| a | b |\n| --- | --- |\n| **x** | y |";
      expect(types(renderMarkdown(bolded))).toContain("strong");
    });

    it("treats prose containing a pipe as prose", () => {
      // Only a delimiter row makes a table; a stray pipe does not.
      const prose = "Use grep | head to read it.";
      const shape = types(renderMarkdown(prose));
      expect(shape).toContain("p");
      expect(shape).not.toContain("table");
    });

    it("scrolls the table rather than the page", () => {
      // A four-column comparison does not fit a phone, and a horizontally
      // scrolling document is worse than a horizontally scrolling table.
      const [wrapper] = renderMarkdown(TABLE);
      expect(isValidElement(wrapper)).toBe(true);
      expect((wrapper as { props: { className?: string } }).props.className).toContain(
        "overflow-x-auto",
      );
    });
  });

  it("renders a real answer, captured from the model verbatim", () => {
    // Copied from an actual reply, not written to suit the parser. It carries
    // every shape at once: a table whose cells hold citations, bold, and a list
    // whose markers are asterisks followed by several spaces.
    const answer = `| Model | Architecture | Licence |
| --- | --- | --- |
| Llama 3 70B | Dense transformer [c4] | Commercial-use licence [c3] |
| Mixtral 8x22B | Mixture-of-experts transformer [c5] | Apache 2.0 [c7] |

**Key Tradeoffs**

The claims suggest a tradeoff between raw performance and computational efficiency:

*   **Llama 3 70B** is noted for achieving state-of-the-art performance among open-weight models and being competitive with leading proprietary models [c1][c2]. As a dense transformer, the implication is that this high performance comes without the efficiency mechanisms present in other architectures.
*   **Mixtral 8x22B** prioritizes computational efficiency. By using a mixture-of-experts architecture that routes each token to a subset of experts, it offers high performance at a "far lower inference cost than a comparable dense model" [c6][c8].`;

    const shape = types(renderMarkdown(answer, TARGETS));
    const rendered = text(renderMarkdown(answer, TARGETS));

    expect(shape).toContain("table");
    expect(shape).toContain("ul");
    expect(shape).toContain("strong");
    // Nothing arrives as raw syntax.
    expect(rendered).not.toContain("**");
    expect(rendered).not.toContain("| ---");
  });

  it("renders the shape a real answer arrives in", () => {
    const answer = [
      "**Sejarah Perkembangan AI**",
      "- **ELIZA**: rule-based chatbot [c1].\n- **Perceptron (1957)**: first trainable network [c2].",
      "RNNs suffer from vanishing gradients, which LSTM addressed.",
    ].join("\n\n");

    const tree = renderMarkdown(answer, TARGETS);
    const shape = types(tree);

    expect(shape).toContain("ul");
    expect(shape.filter((t) => t === "li")).toHaveLength(2);
    expect(shape).toContain("strong");
    expect(shape.filter((t) => t === "Link")).toHaveLength(2);
    expect(text(tree)).not.toContain("**");
  });
});
