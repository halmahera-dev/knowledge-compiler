-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- CreateTable
CREATE TABLE "graph_communities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" STRING NOT NULL,
    "fingerprint" STRING NOT NULL,
    "community" INT4 NOT NULL,
    "title" STRING,
    "summary" STRING,
    "node_count" INT4 NOT NULL DEFAULT 0,
    "page_count" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summarised_at" TIMESTAMPTZ(6),

    CONSTRAINT "graph_communities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graph_communities_workspace_community_idx" ON "graph_communities"("workspace_id", "community");

-- CreateIndex
CREATE UNIQUE INDEX "graph_communities_workspace_fingerprint_key" ON "graph_communities"("workspace_id", "fingerprint");
