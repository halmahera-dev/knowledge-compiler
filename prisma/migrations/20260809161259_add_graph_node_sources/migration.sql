-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- AlterTable
ALTER TABLE "graph_nodes" ADD COLUMN     "community" INT4;

-- CreateTable
CREATE TABLE "graph_node_sources" (
    "node_id" UUID NOT NULL,
    "raw_item_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_node_sources_pkey" PRIMARY KEY ("node_id","raw_item_id")
);

-- CreateIndex
CREATE INDEX "graph_node_sources_item_idx" ON "graph_node_sources"("raw_item_id");

-- AddForeignKey
ALTER TABLE "graph_node_sources" ADD CONSTRAINT "graph_node_sources_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_node_sources" ADD CONSTRAINT "graph_node_sources_raw_item_id_fkey" FOREIGN KEY ("raw_item_id") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
