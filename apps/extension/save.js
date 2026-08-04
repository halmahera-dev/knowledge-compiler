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

export const DEFAULT_API = "http://localhost:8000";
export const DEFAULT_APP = "http://localhost:3000";

/** Thrown when there is no session to borrow. Handled, not displayed raw. */
export const NOT_SIGNED_IN = "NOT_SIGNED_IN";

export async function getBases() {
  const stored = await chrome.storage.sync.get(["apiBase", "appBase"]);
  return {
    api: (stored.apiBase || DEFAULT_API).replace(/\/$/, ""),
    app: (stored.appBase || DEFAULT_APP).replace(/\/$/, ""),
  };
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
    throw new Error(`Could not reach the app at ${appBase}. Is it running?`);
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
