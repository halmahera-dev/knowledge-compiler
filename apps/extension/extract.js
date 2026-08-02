/**
 * Readability-style extraction, injected into the active tab on demand.
 *
 * Deliberately dependency-free and scored rather than exhaustive: the backend
 * re-extracts server-side for saved links, so this only needs to be good enough
 * to beat sending the whole DOM. Keeping it to one file with no build step means
 * the extension loads unpacked with no toolchain.
 */
function extractReadable() {
  const STRIP = "script,style,noscript,nav,header,footer,aside,form,iframe,svg,button";

  /** Containers that usually hold the article body, best first. */
  const CANDIDATES = [
    "article",
    "main",
    '[role="main"]',
    "[itemprop='articleBody']",
    ".post-content",
    ".article-content",
    ".entry-content",
    ".markdown-body",
    "#content",
  ];

  function textDensity(element) {
    const text = element.innerText || "";
    // Link-heavy blocks are navigation, not prose, so they score down.
    const linkChars = Array.from(element.querySelectorAll("a")).reduce(
      (sum, a) => sum + (a.innerText || "").length,
      0,
    );
    return text.length - linkChars * 2;
  }

  function pickRoot() {
    let best = null;
    let bestScore = 0;

    for (const selector of CANDIDATES) {
      for (const element of document.querySelectorAll(selector)) {
        const score = textDensity(element);
        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
    }

    // Fall back to the densest <div> before giving up on <body>, which would
    // drag in the whole chrome of the page.
    if (bestScore < 500) {
      for (const element of document.querySelectorAll("div")) {
        const score = textDensity(element);
        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
    }

    return best && bestScore > 200 ? best : document.body;
  }

  const root = pickRoot();
  const clone = root.cloneNode(true);
  clone.querySelectorAll(STRIP).forEach((node) => node.remove());

  const text = (clone.innerText || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const title =
    document.querySelector("meta[property='og:title']")?.content ||
    document.querySelector("h1")?.innerText?.trim() ||
    document.title;

  return { title: (title || "").trim().slice(0, 300), text, url: location.href };
}

extractReadable();
