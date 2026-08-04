/**
 * Popup logic: extract the active tab, POST it, report what happened.
 *
 * The extension stays thin on purpose (HLD §3.2) — it extracts and submits, and
 * all compilation happens server-side. Token minting and posting live in
 * `save.js` because the context menu needs exactly the same thing, and two
 * copies of an auth path is one too many.
 */
import { DEFAULT_API, DEFAULT_APP, NOT_SIGNED_IN, getBases, saveItem } from "./save.js";

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");
const apiEl = document.getElementById("api");
const appEl = document.getElementById("app");

/** What the current tab yielded, filled in by `loadPage`. */
let extracted = null;
let metadata = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function loadPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // chrome:// and the Web Store block script injection outright, so say so
  // rather than failing with an opaque error.
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) {
    titleEl.textContent = "Can't clip this page";
    metaEl.textContent = "Only http and https pages can be clipped.";
    return;
  }

  try {
    // Two injections rather than one file: readability and metadata answer
    // different questions, and a page with no structured data should still clip.
    const [readable, metaResult] = await Promise.all([
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] }),
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["metadata.js"] })
        .catch(() => [{ result: null }]),
    ]);

    extracted = readable?.[0]?.result ?? null;
    metadata = metaResult?.[0]?.result ?? null;
    if (!extracted || extracted.text.length < 200) {
      titleEl.textContent = extracted?.title || tab.title || "Not much text here";
      metaEl.textContent =
        "Too little readable text to compile. Try saving the URL from the app instead.";
      return;
    }

    // Prefer the publisher's own title over the heading heuristic.
    titleEl.textContent = metadata?.title || extracted.title || tab.title;

    const facts = [`${extracted.text.length.toLocaleString()} characters`];
    if (metadata?.siteName) facts.push(metadata.siteName);
    else facts.push(new URL(extracted.url).hostname);
    if (metadata?.authors?.length) facts.push(metadata.authors.slice(0, 2).join(", "));
    if (metadata?.publishedAt) {
      facts.push(new Date(metadata.publishedAt).toLocaleDateString());
    }
    metaEl.textContent = facts.join(" · ");

    if (metadata?.paywalled) {
      // A teaser compiles into a page that looks complete but says nothing, so
      // the warning is worth the space.
      setStatus("This page looks paywalled — you may be clipping a preview.", "err");
    }
    saveEl.disabled = false;
  } catch (error) {
    titleEl.textContent = "Can't read this page";
    metaEl.textContent = String(error?.message ?? error);
  }
}

async function save() {
  if (!extracted) return;
  saveEl.disabled = true;
  setStatus("Saving…");

  await chrome.storage.sync.set({
    apiBase: (apiEl.value || DEFAULT_API).replace(/\/$/, ""),
    appBase: (appEl.value || DEFAULT_APP).replace(/\/$/, ""),
  });

  try {
    const result = await saveItem({
      captureType: "clip",
      content: extracted.text,
      sourceUrl: metadata?.canonicalUrl || extracted.url,
      title: metadata?.title || extracted.title,
    });

    if (result.duplicate) {
      const matched = result.duplicateOf?.title;
      setStatus(
        matched ? `Already saved as “${matched}”.` : "Already saved — nothing to recompile.",
        "ok",
      );
    } else {
      setStatus("Saved. Compiling in the app…", "ok");
    }
  } catch (error) {
    const message = String(error?.message ?? error);

    if (message === NOT_SIGNED_IN) {
      // Actionable rather than descriptive: the fix is one click away.
      setStatus("", "err");
      statusEl.append("Sign in to the app, then save again. ");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "Open the app";
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        const { app } = await getBases();
        chrome.tabs.create({ url: `${app}/signin` });
      });
      statusEl.append(link);
      saveEl.disabled = false;
      return;
    }

    setStatus(message, "err");
    saveEl.disabled = false;
  }
}

(async () => {
  const bases = await getBases();
  apiEl.value = bases.api;
  appEl.value = bases.app;
  saveEl.addEventListener("click", save);
  await loadPage();
})();
