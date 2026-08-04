/**
 * The pure parts of saving, which are the parts that fail quietly.
 *
 * `originPattern` decides which origin the extension asks Chrome for. Ask for
 * the wrong one and nothing visible happens: the grant succeeds, and then every
 * save fails as though you were signed out, because a cross-origin fetch without
 * host access drops the session cookie rather than erroring.
 *
 * Run by `pnpm test:scripts`. No runner dependency — the extension has none, and
 * one test file does not justify starting.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { originPattern, originsFor, titleFromText } from "./save.js";

describe("originPattern", () => {
  it("reduces a URL to the match pattern Chrome wants", () => {
    assert.equal(originPattern("https://api.example.com"), "https://api.example.com/*");
  });

  it("drops a path, which is what a pasted URL usually carries", () => {
    // Someone copies the address bar mid-session; the pattern must still be the
    // origin, since a path-scoped grant would not cover /api/v1/items.
    assert.equal(
      originPattern("https://app.example.com/wiki/some-page?x=1"),
      "https://app.example.com/*",
    );
  });

  it("keeps the port, because localhost:8000 and :3000 are different origins", () => {
    assert.equal(originPattern("http://localhost:8000"), "http://localhost:8000/*");
    assert.notEqual(originPattern("http://localhost:8000"), originPattern("http://localhost:3000"));
  });

  it("returns null for something that is not a URL", () => {
    // Null rather than a guess: requesting a malformed pattern throws inside
    // chrome.permissions and takes the save down with it.
    assert.equal(originPattern("not a url"), null);
    assert.equal(originPattern(""), null);
  });
});

describe("originsFor", () => {
  it("asks for both origins a save touches", () => {
    assert.deepEqual(originsFor("https://api.example.com", "https://app.example.com"), [
      "https://api.example.com/*",
      "https://app.example.com/*",
    ]);
  });

  it("drops the unusable one rather than failing the whole request", () => {
    assert.deepEqual(originsFor("https://api.example.com", "rubbish"), [
      "https://api.example.com/*",
    ]);
  });

  it("yields nothing when neither is usable, so the caller can skip asking", () => {
    assert.deepEqual(originsFor("", ""), []);
  });
});

describe("titleFromText", () => {
  it("leaves a short line alone", () => {
    assert.equal(titleFromText("A short note"), "A short note");
  });

  it("cuts on a word boundary, because a severed word reads as corruption", () => {
    const title = titleFromText("a".repeat(30) + " boundary " + "b".repeat(60), 45);
    assert.ok(title.endsWith("…"));
    assert.ok(!title.includes("bbb"));
  });

  it("collapses the whitespace a selection drags in", () => {
    assert.equal(titleFromText("two\n\n  words"), "two words");
  });

  it("still cuts when there is no space to cut on", () => {
    // A single long token would otherwise pass through at full length.
    const title = titleFromText("x".repeat(200), 70);
    assert.ok(title.length <= 71, `got ${title.length}`);
  });
});
