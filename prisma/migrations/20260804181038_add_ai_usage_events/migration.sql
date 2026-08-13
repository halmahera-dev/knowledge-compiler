-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" STRING NOT NULL,
    "service" STRING NOT NULL,
    "operation" STRING NOT NULL,
    "provider" STRING NOT NULL,
    "model" STRING NOT NULL,
    "input_tokens" INT4,
    "output_tokens" INT4,
    "total_tokens" INT4,
    "tokens_estimated" BOOL NOT NULL DEFAULT false,
    "estimated_usd" DECIMAL(14,10),
    "latency_ms" INT4,
    "status" STRING NOT NULL DEFAULT 'ok',
    "error" STRING,
    "compile_run_id" UUID,
    "chat_session_id" UUID,
    "raw_item_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_workspace_created_idx" ON "ai_usage_events"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_usage_workspace_op_idx" ON "ai_usage_events"("workspace_id", "operation", "created_at" DESC);
