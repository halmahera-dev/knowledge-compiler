/**
 * Popup logic: extract the active tab, POST it, report what happened.
 *
 * The extension stays thin on purpose (HLD §3.2) — it extracts and submits, and
 * all compilation happens server-side. Everything it knows about the result comes
 * back from the API.
 */
const DEFAULT_API = "http://localhost:8000";
const DEFAULT_APP = "http://localhost:3000";

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");
const apiEl = document.getElementById("api");
const appEl = document.getElementById("app");

let extracted = null;
let metadata = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = kind;
}

async function getApiBase() {
  const stored = await chrome.storage.sync.get("apiBase");
  return stored.apiBase || DEFAULT_API;
}

async function getAppBase() {
  const stored = await chrome.storage.sync.get("appBase");
  return stored.appBase || DEFAULT_APP;
}

/**
 * Borrows a workspace-scoped token from the app's session.
 *
 * The extension deliberately has no login of its own. It sends the app's session
 * cookie (`credentials: "include"`, which needs the app's origin in
 * `host_permissions`) and lets Better Auth mint a short-lived JWT — so the
 * extension never sees a password, stores no long-lived credential, and clips
 * into whichever workspace the app currently has open.
 *
 * The app must list this extension's origin in BETTER_AUTH_TRUSTED_ORIGINS, or
 * the mint is refused as cross-origin.
 */
async function mintToken(appBase) {
  let response;
  try {
    response = await fetch(`${appBase}/api/auth/token`, { credentials: "include" });
  } catch {
    throw new Error(`Could not reach the app at ${appBase}. Is it running?`);
  }

  if (response.status === 401 || response.status === 404) {
    throw new Error("NOT_SIGNED_IN");
  }
  if (response.status === 403) {
    throw new Error(
      "The app refused this extension. Add its id to BETTER_AUTH_TRUSTED_ORIGINS and restart the app.",
    );
  }
  if (!response.ok) throw new Error(`Could not get a token (${response.status}).`);

  const body = await response.json().catch(() => ({}));
  if (!body.token) throw new Error("NOT_SIGNED_IN");
  return body.token;
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

  const base = (apiEl.value || DEFAULT_API).replace(/\/$/, "");
  const appBase = (appEl.value || DEFAULT_APP).replace(/\/$/, "");
  await chrome.storage.sync.set({ apiBase: base, appBase });

  try {
    const token = await mintToken(appBase);

    const response = await fetch(`${base}/api/v1/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        captureType: "clip",
        content: extracted.text,
        sourceUrl: metadata?.canonicalUrl || extracted.url,
        title: metadata?.title || extracted.title,
      }),
    });

    // A token was minted a moment ago, so a 401 here means it was rejected —
    // clock skew, or the app and API disagreeing about the issuer.
    if (response.status === 401) {
      throw new Error("The API rejected the app's token. Check BETTER_AUTH_URL matches.");
    }
    if (response.status === 409) {
      throw new Error("No workspace is selected. Open the app and choose one.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `API returned ${response.status}`);
    }

    const result = await response.json();
    if (result.duplicate) {
      setStatus("Already saved — nothing to recompile.", "ok");
    } else {
      setStatus("Saved. Compiling in the app…", "ok");
    }
  } catch (error) {
    const message = String(error?.message ?? error);

    if (message === "NOT_SIGNED_IN") {
      // Actionable rather than descriptive: the fix is one click away, so offer
      // the click instead of describing it.
      setStatus("", "err");
      statusEl.append("Sign in to the app, then clip again. ");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "Open the app";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: `${appBase}/signin` });
      });
      statusEl.append(link);
      saveEl.disabled = false;
      return;
    }

    // The next most common cause is the API not running, so name it.
    setStatus(
      message.includes("Failed to fetch") ? `Could not reach ${base}. Is the API running?` : message,
      "err",
    );
    saveEl.disabled = false;
  }
}

(async () => {
  apiEl.value = await getApiBase();
  appEl.value = await getAppBase();
  saveEl.addEventListener("click", save);
  await loadPage();
})();
