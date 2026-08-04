/**
 * Right-click saving.
 *
 * The popup is fine when you have decided to clip a whole article, but it is the
 * wrong shape for the common case: you are reading a thread, one comment is worth
 * keeping, and opening a popup to paste it back in defeats the point. So the
 * context menu saves what is already selected, in place, without leaving the page.
 *
 * Everything runs in the service worker because there is no popup open to run it
 * in. That means no DOM to report into either, so results come back as
 * notifications — a save that gives no sign of having happened is one people
 * repeat.
 */
import { NOT_SIGNED_IN, getBases, saveItem, titleFromText } from "./save.js";

const MENU = {
  selection: "kc-save-selection",
  page: "kc-save-page",
  link: "kc-save-link",
};

chrome.runtime.onInstalled.addListener(() => {
  // Rebuilt rather than added to: reloading the extension during development
  // would otherwise fail on duplicate ids.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.selection,
      title: 'Save "%s" to Knowledge Compiler',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU.page,
      title: "Save this page to Knowledge Compiler",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU.link,
      title: "Save this link to Knowledge Compiler",
      contexts: ["link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Not awaited: the listener must return synchronously or the menu appears to
  // hang. Errors are reported by the handler itself.
  void handle(info, tab);
});

async function handle(info, tab) {
  await flash("…", "#8a8580");

  try {
    const payload = await buildPayload(info, tab);
    const result = await saveItem(payload);

    if (result.duplicate) {
      const title = result.duplicateOf?.title;
      await done("Already saved", title ? `Matched “${title}”.` : "Nothing to recompile.", "…");
    } else if ((result.partsQueued ?? 1) > 1) {
      await done("Saved", `Long enough to compile in ${result.partsQueued} parts.`, "✓");
    } else {
      await done("Saved", "Compiling now — watch it land in the app.", "✓");
    }
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message === NOT_SIGNED_IN) {
      const { app } = await getBases();
      await done("Sign in first", "A clip goes to the workspace open in the app.", "!");
      // Opening the tab is the whole remedy, and a notification they must read
      // and then act on is one step too many.
      await chrome.tabs.create({ url: `${app}/signin` });
      return;
    }
    await done("Could not save", message.slice(0, 160), "!");
  }
}

/**
 * What to send, decided by what was right-clicked.
 *
 * A selection is its own excerpt and needs no fetching. A link is handed over as
 * a URL so the API fetches and extracts it server-side — the same path the app
 * uses, including its SSRF guard. A page is read here, because only the browser
 * has the rendered article.
 */
async function buildPayload(info, tab) {
  if (info.menuItemId === MENU.link && info.linkUrl) {
    return { captureType: "link", sourceUrl: info.linkUrl };
  }

  if (info.menuItemId === MENU.selection && info.selectionText) {
    const text = info.selectionText.trim();
    if (text.length < 80) {
      throw new Error("That selection is too short to compile into anything.");
    }
    return {
      captureType: "paste",
      content: text,
      title: titleFromText(text),
      sourceUrl: info.pageUrl ?? tab?.url ?? null,
    };
  }

  return readPage(tab);
}

/** Extracts the readable article from the tab, reusing the popup's injections. */
async function readPage(tab) {
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) {
    throw new Error("Only http and https pages can be saved.");
  }

  const [readable, meta] = await Promise.all([
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] }),
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["metadata.js"] })
      .catch(() => [{ result: null }]),
  ]);

  const extracted = readable?.[0]?.result;
  const metadata = meta?.[0]?.result;

  if (!extracted || extracted.text.length < 200) {
    throw new Error("Too little readable text here. Select the part you want instead.");
  }

  return {
    captureType: "clip",
    content: extracted.text,
    title: metadata?.title || extracted.title || tab.title,
    sourceUrl: metadata?.canonicalUrl || extracted.url,
  };
}

/**
 * Feedback, twice over.
 *
 * The badge is instant and unmissable while you are still looking at the page;
 * the notification carries the detail. Neither alone is enough — a badge cannot
 * say what it matched, and a notification is easy to miss mid-scroll.
 */
async function flash(text, colour) {
  await chrome.action.setBadgeBackgroundColor({ color: colour });
  await chrome.action.setBadgeText({ text });
}

async function done(title, message, badge) {
  await flash(badge, badge === "✓" ? "#2f855a" : badge === "!" ? "#c53030" : "#8a8580");
  chrome.notifications?.create({
    type: "basic",
    iconUrl: "icon.png",
    title: `Knowledge Compiler — ${title}`,
    message,
  });
  // Cleared so the badge reflects the last action rather than accumulating.
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}
