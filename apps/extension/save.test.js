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
import { readFile } from "node:fs/promises";
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

describe("environments", () => {
  it("every environment's origins are in the manifest", async () => {
    // The manifest cannot read config.js, so the two are kept in step by hand.
    // Drift is silent in the worst way: Chrome blocks the request before it is
    // made, and a `credentials: "include"` fetch without host access drops the
    // session cookie — so it surfaces as "you are signed out", not as a
    // permissions problem.
    const { ENVIRONMENTS } = await import("./config.js");
    const manifest = JSON.parse(
      await readFile(new URL("./manifest.json", import.meta.url), "utf8"),
    );
    const granted = new Set(manifest.host_permissions);

    for (const env of ENVIRONMENTS) {
      for (const base of [env.app, env.api]) {
        assert.ok(
          granted.has(`${base}/*`),
          `${base}/* missing from manifest host_permissions (needed by "${env.label}")`,
        );
      }
    }
  });

  it("covers the three addresses this project runs at", async () => {
    const { ENVIRONMENTS } = await import("./config.js");
    const hosts = ENVIRONMENTS.map((env) => new URL(env.app).hostname);
    for (const host of ["localhost", "127.0.0.1", "34.228.186.46"]) {
      assert.ok(hosts.includes(host), `no environment for ${host}`);
    }
  });

  it("pairs each app with an API on the same host", async () => {
    // The app is where the session lives and the API is where the item goes.
    // Crossing them mints a token one host will not accept from the other.
    const { ENVIRONMENTS } = await import("./config.js");
    for (const env of ENVIRONMENTS) {
      assert.equal(new URL(env.app).hostname, new URL(env.api).hostname, env.label);
    }
  });

  it("has a default that is one of the environments", async () => {
    const { ENVIRONMENTS, DEFAULT_APP, DEFAULT_API } = await import("./config.js");
    const match = ENVIRONMENTS.find((env) => env.app === DEFAULT_APP);
    assert.ok(match, "DEFAULT_APP is not in ENVIRONMENTS");
    assert.equal(match.api, DEFAULT_API);
  });
});
