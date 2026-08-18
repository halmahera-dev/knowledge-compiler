/**
 * Popup logic: extract the active tab, POST it, report what happened.
 *
 * The extension stays thin on purpose (HLD §3.2) — it extracts and submits, and
 * all compilation happens server-side. Token minting and posting live in
 * `save.js` because the context menu needs exactly the same thing, and two
 * copies of an auth path is one too many.
 */
import {
  DEFAULT_API,
  DEFAULT_APP,
  NOT_SIGNED_IN,
  getBases,
  originsFor,
  saveItem,
} from "./save.js";
import { finishProgress, startProgress } from "./progress.js";

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");

/** What the current tab yielded, filled in by `loadPage`. */
let extracted = null;
let metadata = null;
/** Kept so the overlay can be drawn in the page the clip came from. */
let tabId = null;

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

  tabId = tab.id;

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

  const label = metadata?.title || extracted.title || "This page";

  // Drawn in the page rather than only here, because closing the popup is the
  // natural thing to do while a save is in flight — and then the result had
  // nowhere to land.
  await startProgress(tabId, label, "Reading this page…");

  try {
    const result = await saveItem({
      captureType: "clip",
      content: extracted.text,
      sourceUrl: metadata?.canonicalUrl || extracted.url,
      title: metadata?.title || extracted.title,
    });

    if (result.duplicate) {
      const matched = result.duplicateOf?.title;
      const detail = matched
        ? `Already saved as “${matched}”.`
        : "Already saved — nothing to recompile.";
      setStatus(detail, "ok");
      await finishProgress(tabId, "duplicate", label, detail);
    } else {
      setStatus("Saved. Compiling in the app…", "ok");
      await finishProgress(tabId, "saved", label, "Compiling now — watch it land in the app.");
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
      await finishProgress(tabId, "error", "Sign in first", "Then save again.");
      return;
    }

    setStatus(message, "err");
    saveEl.disabled = false;
    await finishProgress(tabId, "error", label, message.slice(0, 200));
  }
}

/**
 * Asks Chrome for the two origins this build is pointed at.
 *
 * Only localhost is a required permission; everything else is optional and
 * granted here, which is what lets one unmodified build work against a deployed
 * instance. Previously the API and App fields accepted any URL and then Chrome
 * blocked the request before it was made — the fields promised something the
 * manifest forbade.
 *
 * Called as the first thing in the click handler, before any `await`, because
 * `permissions.request` needs the user gesture and an await spends it. When the
 * origins are already granted it resolves immediately without a prompt, so this
 * costs nothing on the common path.
 *
 * That is why the bases are resolved when the popup opens rather than here:
 * `getBases` may probe the network, and awaiting it inside the click would
 * spend the gesture before Chrome was ever asked.
 */
function ensureAccess(bases) {
  const origins = originsFor(bases.api, bases.app);
  if (!origins.length) return Promise.resolve(true);
  try {
    return chrome.permissions.request({ origins });
  } catch {
    // Not fatal on its own: let the save try and report the real failure.
    return Promise.resolve(true);
  }
}

(async () => {
  // Resolved once, up front. Nothing here is configurable any more, so this is
  // the only place that needs to know where this popup is pointed.
  const bases = await getBases();

  saveEl.addEventListener("click", async () => {
    if (!(await ensureAccess(bases))) {
      setStatus("Access to those URLs was declined, so nothing can be saved to them.", "err");
      return;
    }
    await save();
  });

  await loadPage();
})();
