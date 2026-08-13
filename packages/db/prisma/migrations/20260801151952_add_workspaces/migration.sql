-- Workspaces and wikis.
--
-- HAND-WRITTEN, not the raw `prisma migrate diff` output. Prisma's generated
-- version was unsafe on a populated database in two ways, both of which would
-- have lost data:
--
--   1. `ADD COLUMN workspace_id STRING NOT NULL` with no default fails outright
--      on a table that already has rows.
--   2. It emitted `DROP COLUMN user_id` followed by `ADD COLUMN user_id` to
--      change the type from UUID to STRING — which silently discards every
--      existing value rather than converting it.
--
-- Instead: add columns with a sentinel default, convert types in place, then
-- drop the defaults so future inserts must be explicit.
--
-- `workspace_id` holds a Better Auth organization id, and `user_id` a Better
-- Auth user id. Both are STRING, not UUID, because Better Auth generates
-- alphanumeric ids. Neither carries a foreign key: those rows live in the `auth`
-- schema, owned and migrated by a different service.

SET create_table_with_schema_locked = off;

-- ─── the sentinel ────────────────────────────────────────────────────────────
-- Rows that predate workspaces are parked here rather than deleted. Nobody is a
-- member of this workspace, so it is invisible in the app until explicitly
-- adopted — see the note at the end of this file.

-- ─── wikis ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "wikis" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" STRING NOT NULL,
    "name"         STRING NOT NULL,
    "slug"         STRING NOT NULL,
    "description"  STRING NOT NULL DEFAULT '',
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wikis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wikis_workspace_idx" ON "wikis" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wikis_workspace_slug_key" ON "wikis" ("workspace_id", "slug");

-- A home for pre-existing rows. Fixed id so the backfill below is deterministic.
INSERT INTO "wikis" ("id", "workspace_id", "name", "slug", "description")
VALUES (
    '00000000-0000-0000-0000-0000000000aa',
    'legacy',
    'Imported',
    'imported',
    'Content saved before workspaces existed.'
)
ON CONFLICT ("id") DO NOTHING;

-- ─── add the scoping columns ─────────────────────────────────────────────────
-- Defaults make this safe on populated tables; they are dropped further down so
-- application inserts cannot silently land in the sentinel workspace.

ALTER TABLE "raw_items"      ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "raw_items"      ADD COLUMN IF NOT EXISTS "wiki_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-0000000000aa';
ALTER TABLE "wiki_pages"     ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "wiki_pages"     ADD COLUMN IF NOT EXISTS "wiki_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-0000000000aa';
ALTER TABLE "graph_nodes"    ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "graph_edges"    ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "compile_runs"   ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "knowledge_gaps" ADD COLUMN IF NOT EXISTS "workspace_id" STRING NOT NULL DEFAULT 'legacy';

-- ─── drop the old user_id indexes FIRST ──────────────────────────────────────
-- CockroachDB rejects `ALTER COLUMN TYPE` when the column participates in an
-- index (unimplemented, cockroachdb#47636), so these have to be removed before
-- user_id can be converted from UUID to STRING — not after.

DROP INDEX IF EXISTS "raw_items_user_content_hash_key" CASCADE;
DROP INDEX IF EXISTS "raw_items_user_created_idx" CASCADE;
DROP INDEX IF EXISTS "wiki_pages_user_slug_key" CASCADE;
DROP INDEX IF EXISTS "wiki_pages_user_updated_idx" CASCADE;
DROP INDEX IF EXISTS "graph_nodes_user_label_key" CASCADE;
DROP INDEX IF EXISTS "graph_edges_user_idx" CASCADE;
DROP INDEX IF EXISTS "compile_runs_user_created_idx" CASCADE;
DROP INDEX IF EXISTS "knowledge_gaps_user_question_key" CASCADE;
DROP INDEX IF EXISTS "knowledge_gaps_user_status_idx" CASCADE;


-- ─── replace user_id UUID -> STRING ──────────────────────────────────────────
-- Better Auth ids are alphanumeric, not UUIDs, so this column changes type.
--
-- It is REPLACED rather than converted, for two reasons. CockroachDB only
-- implements ALTER COLUMN TYPE in the declarative schema changer, which this
-- migration cannot use (it needs schema_locked off for the FK statements). And
-- more importantly the old values carry no information worth preserving: every
-- row holds the same hardcoded placeholder `00000000-0000-0000-0000-000000000001`
-- from the single-user build, which identifies no real account. Converting it to
-- text would faithfully preserve a value that means nothing.
--
-- Legacy rows land on the 'legacy' sentinel alongside their workspace.

ALTER TABLE "raw_items"    DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "compile_runs" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "raw_items"    ADD COLUMN IF NOT EXISTS "user_id" STRING NOT NULL DEFAULT 'legacy';
ALTER TABLE "compile_runs" ADD COLUMN IF NOT EXISTS "user_id" STRING NOT NULL DEFAULT 'legacy';

-- graph_nodes, graph_edges, knowledge_gaps and wiki_pages are scoped by
-- workspace alone — who saved a concept is not interesting, and keeping a
-- per-user column there would invite queries that filter by the wrong thing.
ALTER TABLE "wiki_pages"     DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "graph_nodes"    DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "graph_edges"    DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "knowledge_gaps" DROP COLUMN IF EXISTS "user_id";

-- Dedupe moves to the workspace: two people in one workspace saving the same
-- article should produce one item, not two competing compiles.
CREATE UNIQUE INDEX IF NOT EXISTS "raw_items_workspace_content_hash_key"
    ON "raw_items" ("workspace_id", "content_hash");
CREATE INDEX IF NOT EXISTS "raw_items_workspace_created_idx"
    ON "raw_items" ("workspace_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "raw_items_wiki_idx" ON "raw_items" ("wiki_id");

-- Page slugs are unique per WIKI: two wikis in one workspace may each hold a
-- "transformers" page about entirely different things.
CREATE UNIQUE INDEX IF NOT EXISTS "wiki_pages_wiki_slug_key"
    ON "wiki_pages" ("wiki_id", "slug");
CREATE INDEX IF NOT EXISTS "wiki_pages_workspace_updated_idx"
    ON "wiki_pages" ("workspace_id", "updated_at" DESC);

-- One node per concept per WORKSPACE, deliberately not per wiki. This is what
-- allows an edge to join a page in one wiki to a page in another — the
-- cross-wiki connection is the point of the product, not a side effect.
CREATE UNIQUE INDEX IF NOT EXISTS "graph_nodes_workspace_label_key"
    ON "graph_nodes" ("workspace_id", "label");
CREATE INDEX IF NOT EXISTS "graph_edges_workspace_idx" ON "graph_edges" ("workspace_id");
CREATE INDEX IF NOT EXISTS "compile_runs_workspace_created_idx"
    ON "compile_runs" ("workspace_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_gaps_workspace_question_key"
    ON "knowledge_gaps" ("workspace_id", "question");
CREATE INDEX IF NOT EXISTS "knowledge_gaps_workspace_status_idx"
    ON "knowledge_gaps" ("workspace_id", "status", "created_at" DESC);

-- ─── foreign keys ────────────────────────────────────────────────────────────

ALTER TABLE "raw_items"  ADD CONSTRAINT "raw_items_wiki_id_fkey"
    FOREIGN KEY ("wiki_id") REFERENCES "wikis" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_wiki_id_fkey"
    FOREIGN KEY ("wiki_id") REFERENCES "wikis" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── drop the backfill defaults ──────────────────────────────────────────────
-- From here on every insert must state its workspace explicitly. Leaving these
-- in place would let a scoping bug quietly write into the sentinel workspace
-- instead of failing loudly.

ALTER TABLE "raw_items"      ALTER COLUMN "workspace_id" DROP DEFAULT;
ALTER TABLE "raw_items"      ALTER COLUMN "wiki_id" DROP DEFAULT;
ALTER TABLE "raw_items"      ALTER COLUMN "user_id" DROP DEFAULT;
ALTER TABLE "compile_runs"   ALTER COLUMN "user_id" DROP DEFAULT;
ALTER TABLE "wiki_pages"     ALTER COLUMN "workspace_id" DROP DEFAULT;
ALTER TABLE "wiki_pages"     ALTER COLUMN "wiki_id" DROP DEFAULT;
ALTER TABLE "graph_nodes"    ALTER COLUMN "workspace_id" DROP DEFAULT;
ALTER TABLE "graph_edges"    ALTER COLUMN "workspace_id" DROP DEFAULT;
ALTER TABLE "compile_runs"   ALTER COLUMN "workspace_id" DROP DEFAULT;
ALTER TABLE "knowledge_gaps" ALTER COLUMN "workspace_id" DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL: vector indexes
--
-- Prisma cannot express these and `migrate diff` proposes dropping them on every
-- run; `scripts/migrate.mjs` strips those DROP statements. They are recreated
-- here only if the drops above removed them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VECTOR INDEX IF NOT EXISTS "wiki_pages_embedding_idx"
    ON "wiki_pages" ("embedding" vector_cosine_ops);

CREATE VECTOR INDEX IF NOT EXISTS "raw_items_embedding_idx"
    ON "raw_items" ("embedding" vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-existing content now lives in workspace 'legacy', wiki 'imported'. Nobody
-- is a member of that workspace, so it is invisible in the app. To adopt it into
-- a real workspace, run with that workspace's id:
--
--   UPDATE kc.raw_items      SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.wiki_pages     SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.graph_nodes    SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.graph_edges    SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.compile_runs   SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.knowledge_gaps SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--   UPDATE kc.wikis          SET workspace_id = '<id>' WHERE workspace_id = 'legacy';
--
-- Or discard it:  DELETE FROM kc.wikis WHERE workspace_id = 'legacy';  (cascades)
-- ─────────────────────────────────────────────────────────────────────────────
