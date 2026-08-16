import assert from "node:assert/strict";
import { test } from "node:test";

import { withMigrationSchema } from "./migrate.mjs";

/**
 * Prisma reads its migration history from the connection's default schema.
 * Ours lives in `kc`, and the default is `public` — which belongs to an
 * unrelated application sharing the database. Without the parameter, `migrate
 * deploy` reports "migration persistence is not initialized" and the deploy
 * fails on a database that is perfectly healthy.
 */

test("adds schema=kc when the URL names no schema", () => {
	const out = withMigrationSchema(
		"postgresql://u:p@host:26257/db?sslmode=verify-full",
	);

	assert.match(out, /schema=kc/);
	// The parameters already there have to survive: dropping sslmode on a
	// CockroachDB Cloud cluster turns this into a connection refusal.
	assert.match(out, /sslmode=verify-full/);
});

test("adds it to a URL with no query string at all", () => {
	assert.match(
		withMigrationSchema("postgresql://root@localhost:26257/knowledge_base"),
		/[?&]schema=kc/,
	);
});

test("leaves an explicit schema alone", () => {
	const url = "postgresql://u@h:26257/db?schema=other";

	// Someone naming a schema means it, and silently overriding would move the
	// migration history without saying so.
	assert.equal(withMigrationSchema(url), url);
});

test("keeps the credentials and host intact", () => {
	const out = withMigrationSchema(
		"postgresql://user:secret@halmahera.cockroachlabs.cloud:26257/base?sslmode=verify-full",
	);

	assert.match(out, /user:secret@halmahera\.cockroachlabs\.cloud:26257/);
	assert.match(out, /\/base\?/);
});

test("passes through anything it cannot parse", () => {
	// Prisma's own error names the variable, which is more use than one raised
	// from here about a string this script only meant to annotate.
	assert.equal(withMigrationSchema("not a url"), "not a url");
	assert.equal(withMigrationSchema(""), "");
	assert.equal(withMigrationSchema(undefined), undefined);
});
