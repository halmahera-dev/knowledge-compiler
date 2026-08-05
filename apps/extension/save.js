/**
 * Saving into the knowledge base, shared by the popup and the context menu.
 *
 * The extension has no login of its own and stores no credential. It borrows the
 * app's session: before each save it asks the web app to mint a short-lived
 * workspace-scoped token. So a clip always lands in the workspace that is
 * currently active in the app, under the account signed in there — there is
 * nothing for the extension to get out of sync with, because it holds no state
 * about either.
 */

export { DEFAULT_API, DEFAULT_APP } from "./config.js";
import { DEFAULT_API, DEFAULT_APP } from "./config.js";

/** Thrown when there is no session to borrow. Handled, not displayed raw. */
export const NOT_SIGNED_IN = "NOT_SIGNED_IN";

export async function getBases() {
  const stored = await chrome.storage.sync.get(["apiBase", "appBase"]);
  return {
    api: (stored.apiBase || DEFAULT_API).replace(/\/$/, ""),
    app: (stored.appBase || DEFAULT_APP).replace(/\/$/, ""),
  };
}

/** `https://api.example.com/path` → `https://api.example.com/*`, the match form. */
export function originPattern(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

/** The two origins a save touches: the API it posts to, the app it borrows from. */
export function originsFor(api, app) {
  return [originPattern(api), originPattern(app)].filter(Boolean);
}

/**
 * Whether Chrome will let us reach those origins at all.
 *
 * Only localhost ships as a required permission; anything else is optional and
 * granted at runtime. Without the grant Chrome blocks the request before it is
 * made, and — the part worth guarding — a `credentials: "include"` fetch quietly
 * drops the app's session cookie, so the mint fails as though you were signed
 * out. Checking first turns that into a sentence you can act on.
 */
export async function hasAccess(origins) {
  if (!origins.length) return true;
  try {
    return await chrome.permissions.contains({ origins });
  } catch {
    // Older runtimes without the API: let the request proceed and fail honestly.
    return true;
  }
}

/** Whether a base is one of the development defaults nobody deliberately chose. */
function isLocalhost(base) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base);
}

/** Tells "app is down" apart from "app does not trust this extension". */
async function diagnose(appBase) {
  try {
    await fetch(`${appBase}/api/auth/token`, { mode: "no-cors", credentials: "include" });
  } catch {
    // "Is it running?" is the right question for a developer whose stack is
    // down, and the wrong one for someone using a deployed instance — there the
    // answer is that the extension was never pointed at it. The extension has no
    // build step, so it ships with the development defaults and keeps them until
    // somebody changes them, which is easy to miss when everything else moved to
    // a server.
    if (isLocalhost(appBase)) {
      return [
        `Nothing is running at ${appBase}, which is where this extension still points.`,
        "If your app is deployed, put its URL in the App and API fields below and press Save —",
        "the extension will ask permission for that address the first time.",
      ].join(" ");
    }
    return `Could not reach the app at ${appBase}. Is it running?`;
  }

  const id = chrome.runtime?.id;
  return [
    "The app is running but will not issue a token to this extension.",
    id ? `Add chrome-extension://${id} to BETTER_AUTH_TRUSTED_ORIGINS` : "Set BETTER_AUTH_TRUSTED_ORIGINS",
    "and restart it.",
  ].join(" ");
}

/**
 * Borrows a workspace-scoped token from the app's session.
 *
 * Sends the app's cookie (`credentials: "include"`, which needs the app's origin
 * in `host_permissions`) and lets Better Auth mint a 15-minute JWT. The app must
 * list this extension's origin in BETTER_AUTH_TRUSTED_ORIGINS, or the mint is
 * refused as cross-origin.
 */
export async function mintToken(appBase) {
  let response;
  try {
    response = await fetch(`${appBase}/api/auth/token`, { credentials: "include" });
  } catch {
    // A blocked CORS response and an unreachable server both surface here as the
    // same opaque TypeError, and guessing wrong sends you to check the wrong
    // thing. `no-cors` needs no permission from the app, so if that succeeds the
    // app is plainly up and the mint was refused for this origin — which is what
    // happens whenever the extension id is not the one the app was told about,
    // and the id changes the moment the extension is repacked.
    throw new Error(await diagnose(appBase));
  }

  if (response.status === 401 || response.status === 404) throw new Error(NOT_SIGNED_IN);
  if (response.status === 403) {
    throw new Error(
      "The app refused this extension. Add its id to BETTER_AUTH_TRUSTED_ORIGINS and restart the app.",
    );
  }
  if (!response.ok) throw new Error(`Could not get a token (${response.status}).`);

  const body = await response.json().catch(() => ({}));
  if (!body.token) throw new Error(NOT_SIGNED_IN);
  return body.token;
}

/**
 * Posts one captured item.
 *
 * Returns what the API said, so the caller can tell "saved" from "you already
 * had this" — a re-clip is a no-op, and reporting it as a save would be a lie.
 */
export async function saveItem(payload) {
  const { api, app } = await getBases();

  // Checked here rather than left to fail at the fetch, because the failure is
  // indistinguishable from being signed out — and the remedy, granting access
  // once from the popup, is not something you would guess from that.
  if (!(await hasAccess(originsFor(api, app)))) {
    throw new Error(
      "This build has not been granted access to those URLs yet. Open the extension popup and press Save once to allow them.",
    );
  }

  const token = await mintToken(app);

  const response = await fetch(`${api}/api/v1/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error("The API rejected the app's token. Check BETTER_AUTH_URL matches.");
  }
  if (response.status === 409) {
    throw new Error("No workspace is selected. Open the app and choose one.");
  }
  if (response.status === 429) {
    throw new Error("That is a lot of saving. Try again shortly.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `API returned ${response.status}`);
  }

  return response.json();
}

/**
 * A short label for what was saved.
 *
 * Selections have no title of their own, so one is cut from the opening words —
 * on a word boundary, because a title severed mid-word reads as corruption.
 */
export function titleFromText(text, limit = 70) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;

  const cut = cleaned.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
