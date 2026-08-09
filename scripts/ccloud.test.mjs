/**
 * Reading ccloud's structured output.
 *
 * These are the parts of `ccloud.mjs` worth pinning. Everything else shells out
 * to a tool that reports its own failures; these read a payload and decide which
 * cluster is acted on and which database is migrated. Getting them wrong is
 * silent — a migration runs happily against the wrong thing and says nothing.
 *
 * The CLI is not installed in CI, so these test the parsing against the shapes
 * the documentation describes rather than against a live binary. That is the
 * reason the parsers accept several field spellings and return null instead of
 * guessing: an unrecognised payload has to stop the script, not flow into a
 * command as `undefined`.
 *
 * Run by `pnpm test:scripts`. No runner dependency — the repo has none for
 * scripts, and this does not justify starting.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clustersFrom, connectionUrlFrom, nameOf, withKnowledgeBase } from "./ccloud.mjs";

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
});

describe("clustersFrom", () => {
  it("takes a bare array", () => {
    assert.deepEqual(clustersFrom([{ name: "a" }]), [{ name: "a" }]);
  });

  it("takes an array wrapped in an object, whatever the key is called", () => {
    assert.deepEqual(clustersFrom({ clusters: [{ name: "a" }] }), [{ name: "a" }]);
    assert.deepEqual(clustersFrom({ items: [{ name: "a" }] }), [{ name: "a" }]);
  });

  it("returns nothing rather than throwing on a shape it does not know", () => {
    // The caller turns empty into "no clusters", which is a sentence someone can
    // act on. A thrown TypeError halfway through a migration is not.
    assert.deepEqual(clustersFrom(null), []);
    assert.deepEqual(clustersFrom("nonsense"), []);
    assert.deepEqual(clustersFrom({ total: 0 }), []);
  });
});

describe("nameOf", () => {
  it("reads the documented field", () => {
    assert.equal(nameOf({ name: "kc-prod" }), "kc-prod");
  });

  it("accepts the other spellings this kind of API uses", () => {
    assert.equal(nameOf({ Name: "kc-prod" }), "kc-prod");
    assert.equal(nameOf({ cluster_name: "kc-prod" }), "kc-prod");
  });

  it("returns null rather than a guess when nothing matches", () => {
    // This value decides which cluster gets migrated. Null makes the caller stop
    // and print the keys it did see; undefined would reach ccloud as an argument.
    assert.equal(nameOf({ id: "abc", state: "CREATED" }), null);
    assert.equal(nameOf({}), null);
    assert.equal(nameOf(null), null);
  });

  it("treats an empty name as no name", () => {
    assert.equal(nameOf({ name: "" }), null);
  });
});

describe("connectionUrlFrom", () => {
  it("reads connection_url, the field the CLI documents", () => {
    const url = "postgresql://u:p@host:26257/defaultdb?sslmode=verify-full";
    assert.equal(connectionUrlFrom({ connection_url: url }), url);
  });

  it("accepts the camelCase and short spellings", () => {
    const url = "postgresql://u@h:26257/defaultdb";
    assert.equal(connectionUrlFrom({ connectionUrl: url }), url);
    assert.equal(connectionUrlFrom({ url }), url);
  });

  it("ignores a field that is not a postgres URL", () => {
    // `url` is a plausible name for the Console link too, and connecting to an
    // https address would fail in a way that looks like a network problem.
    assert.equal(connectionUrlFrom({ url: "https://cockroachlabs.cloud/cluster/abc" }), null);
  });

  it("returns null when there is no URL at all", () => {
    assert.equal(connectionUrlFrom({ id: "abc" }), null);
    assert.equal(connectionUrlFrom(null), null);
  });
});
