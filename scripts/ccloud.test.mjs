/**
 * Pointing a Cloud connection string at the right database.
 *
 * This is the one piece of `ccloud.mjs` worth pinning. Everything else shells out
 * to a tool that reports its own failures; this rewrites a URL, and getting it
 * wrong is silent — a migration runs happily against the cluster's default
 * database, or against the wrong cluster entirely, and says nothing.
 *
 * Uses Node's built-in runner: `node --test scripts/`. No dependency, because a
 * five-assertion file does not justify one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { connectionUrl, withKnowledgeBase } from "./ccloud.mjs";

describe("withKnowledgeBase", () => {
  it("replaces the cluster's default database", () => {
    const url =
      "postgresql://akmal:pw@kc-1234.abc.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full";
    assert.equal(
      withKnowledgeBase(url),
      "postgresql://akmal:pw@kc-1234.abc.cockroachlabs.cloud:26257/knowledge_base?sslmode=verify-full",
    );
  });

  it("keeps a cluster prefix, which is how the older form routes", () => {
    // Dropping `kc-1234.` here would connect to a different cluster, not merely
    // a different database.
    const url = "postgresql://u:p@host.cockroachlabs.cloud:26257/kc-1234.defaultdb?sslmode=require";
    assert.equal(
      withKnowledgeBase(url),
      "postgresql://u:p@host.cockroachlabs.cloud:26257/kc-1234.knowledge_base?sslmode=require",
    );
  });

  it("leaves the local URL untouched", () => {
    const url = "postgresql://root@localhost:26257/knowledge_base?sslmode=disable";
    assert.equal(withKnowledgeBase(url), url);
  });

  it("handles a URL with no query string", () => {
    assert.equal(
      withKnowledgeBase("postgresql://u:p@host:26257/defaultdb"),
      "postgresql://u:p@host:26257/knowledge_base",
    );
  });

  it("does not touch credentials or host", () => {
    const url = "postgresql://user.name:p%40ss@host.cockroachlabs.cloud:26257/defaultdb?a=1";
    const out = withKnowledgeBase(url);
    assert.ok(out.startsWith("postgresql://user.name:p%40ss@host.cockroachlabs.cloud:26257/"));
    assert.ok(out.endsWith("?a=1"));
  });

  it("accepts an explicit database name", () => {
    assert.equal(
      withKnowledgeBase("postgresql://u@h:26257/defaultdb", "other"),
      "postgresql://u@h:26257/other",
    );
  });
});

describe("connectionUrl", () => {
  it("picks the postgres line out of surrounding output", () => {
    const raw = [
      "Retrieving cluster info…",
      "postgresql://u:p@host:26257/defaultdb?sslmode=verify-full",
      "",
    ].join("\n");
    assert.equal(connectionUrl(raw), "postgresql://u:p@host:26257/defaultdb?sslmode=verify-full");
  });

  it("falls back to the whole output when no such line exists", () => {
    // Better to hand the caller something it can fail loudly on than an empty
    // string that looks like a valid-but-unset URL.
    assert.equal(connectionUrl("  unexpected  "), "unexpected");
  });
});
