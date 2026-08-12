-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "tokens_estimated" BOOLEAN NOT NULL DEFAULT false,
    "estimated_usd" DECIMAL(14,10),
    "latency_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
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
