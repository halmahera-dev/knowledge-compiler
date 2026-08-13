/**
 * Driving the in-page overlay, from wherever a save was started.
 *
 * Both entry points report the same four things — started, saved, already had
 * it, failed — so the sequencing lives here rather than twice.
 *
 * Every function here swallows its own errors, and that is deliberate rather
 * than lazy. The overlay cannot be injected into the Web Store, a `chrome://`
 * page, a PDF, or a tab that navigated away mid-save. All of those still save
 * perfectly well, and a save that worked must never be reported as failed
 * because its decoration could not be drawn.
 */

/** Injects the overlay if this tab has not got one yet. */
async function ensure(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
}

async function send(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // No receiver: injection was refused, or the tab is gone.
  }
}

/** Shows the compiling animation. Safe to call with a missing tab id. */
export async function startProgress(tabId, label, note) {
  if (!tabId) return;
  try {
    await ensure(tabId);
  } catch {
    return;
  }
  await send(tabId, { kc: "start", label, note });
}

/** Settles the overlay on a result. `state` is saved | duplicate | error. */
export async function finishProgress(tabId, state, label, note) {
  if (!tabId) return;
  await send(tabId, { kc: "result", state, label, note });
}
