/**
 * Structured metadata extraction, injected alongside the readability pass.
 *
 * Knowing the author, publication and date is not decoration — it changes what
 * the compiler can do. Two sources that disagree are a contradiction worth
 * flagging; the same source re-clipped is not. A date lets "supersedes" be
 * distinguished from "contradicts", which the agent otherwise has to guess at.
 *
 * Precedence is fixed and deliberate, most trustworthy first:
 *
 *   1. JSON-LD (schema.org)  — explicitly published structured data
 *   2. citation_* meta       — Highwire Press tags, used by journals and arXiv
 *   3. Dublin Core           — DC.creator / DC.date, common in institutional CMSs
 *   4. OpenGraph / Twitter   — written for social previews, so titles are often
 *                              embellished; trusted last among the structured
 *                              sources but still better than a guess
 *   5. DOM fallbacks         — <title>, <h1>, <time datetime>
 *
 * A later source never overwrites an earlier one, so a publisher's own JSON-LD
 * always beats its share-card copy.
 */

function extractMetadata() {
  const meta = {
    title: null,
    authors: [],
    siteName: null,
    publishedAt: null,
    modifiedAt: null,
    canonicalUrl: null,
    description: null,
    doi: null,
    type: null,
    paywalled: false,
  };

  /** Only fills a field that is still empty — precedence is enforced by call order. */
  const set = (key, value) => {
    if (meta[key] || value == null) return;
    const cleaned = String(value).trim();
    if (cleaned) meta[key] = cleaned;
  };

  const addAuthors = (value) => {
    if (!value) return;
    const list = Array.isArray(value) ? value : [value];
    for (const entry of list) {
      // schema.org authors are often {"@type":"Person","name":"..."}.
      const name = typeof entry === "string" ? entry : entry?.name;
      if (!name) continue;
      const cleaned = String(name).trim();
      if (cleaned && !meta.authors.includes(cleaned)) meta.authors.push(cleaned);
    }
  };

  /** Dates arrive in many shapes; store ISO or nothing rather than a guess. */
  const toIso = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const attr = (selector, name = "content") =>
    document.querySelector(selector)?.getAttribute(name) ?? null;

  // ── 1. JSON-LD ─────────────────────────────────────────────────────────────
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed;
    try {
      parsed = JSON.parse(node.textContent || "");
    } catch {
      // Malformed JSON-LD is common; skip it rather than abandoning extraction.
      continue;
    }
    // A graph, an array, or a bare object — normalise all three.
    const candidates = []
      .concat(parsed?.["@graph"] ?? parsed ?? [])
      .filter((x) => x && typeof x === "object");

    for (const node2 of candidates) {
      const type = String(node2["@type"] ?? "");
      if (!/Article|BlogPosting|NewsArticle|ScholarlyArticle|WebPage|Report/i.test(type)) {
        continue;
      }
      set("type", type);
      set("title", node2.headline ?? node2.name);
      set("description", node2.description);
      set("publishedAt", toIso(node2.datePublished));
      set("modifiedAt", toIso(node2.dateModified));
      set("siteName", node2.publisher?.name);
      addAuthors(node2.author ?? node2.creator);
      if (node2.isAccessibleForFree === false) meta.paywalled = true;
    }
  }

  // ── 2. Highwire Press citation_* (journals, arXiv, PubMed) ────────────────
  for (const node of document.querySelectorAll('meta[name^="citation_"]')) {
    const name = node.getAttribute("name");
    const value = node.getAttribute("content");
    if (!value) continue;
    if (name === "citation_title") set("title", value);
    else if (name === "citation_author") addAuthors(value);
    else if (name === "citation_publication_date" || name === "citation_date") {
      set("publishedAt", toIso(value));
    } else if (name === "citation_journal_title") set("siteName", value);
    else if (name === "citation_doi") set("doi", value);
  }

  // ── 3. Dublin Core ─────────────────────────────────────────────────────────
  set("title", attr('meta[name="DC.title"]') ?? attr('meta[name="dc.title"]'));
  addAuthors(attr('meta[name="DC.creator"]') ?? attr('meta[name="dc.creator"]'));
  set("publishedAt", toIso(attr('meta[name="DC.date"]') ?? attr('meta[name="dc.date"]')));

  // ── 4. OpenGraph and Twitter ───────────────────────────────────────────────
  set("title", attr('meta[property="og:title"]') ?? attr('meta[name="twitter:title"]'));
  set("description", attr('meta[property="og:description"]'));
  set("siteName", attr('meta[property="og:site_name"]'));
  set("type", attr('meta[property="og:type"]'));
  set("publishedAt", toIso(attr('meta[property="article:published_time"]')));
  set("modifiedAt", toIso(attr('meta[property="article:modified_time"]')));
  addAuthors(attr('meta[name="author"]'));

  // ── 5. DOM fallbacks ───────────────────────────────────────────────────────
  set("title", document.querySelector("h1")?.innerText);
  set("title", document.title);
  set("canonicalUrl", attr('link[rel="canonical"]', "href") ?? location.href);
  set("publishedAt", toIso(attr("time[datetime]", "datetime")));
  set("siteName", location.hostname.replace(/^www\./, ""));

  // Paywall signal: worth recording because a clipped preview is not the article,
  // and a page compiled from a teaser would look complete but say nothing.
  if (!meta.paywalled) {
    meta.paywalled =
      !!document.querySelector('[class*="paywall" i], [id*="paywall" i]') ||
      /subscribe to (continue|read)/i.test(document.body?.innerText?.slice(0, 4000) ?? "");
  }

  return meta;
}

extractMetadata();
