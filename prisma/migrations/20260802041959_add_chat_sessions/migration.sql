-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" STRING NOT NULL,
    "user_id" STRING NOT NULL,
    "title" STRING NOT NULL DEFAULT 'New conversation',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" STRING NOT NULL,
    "citations" JSONB,
    "claims" JSONB,
    "refused" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_workspace_updated_idx" ON "chat_sessions"("workspace_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "chat_messages_session_created_idx" ON "chat_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
