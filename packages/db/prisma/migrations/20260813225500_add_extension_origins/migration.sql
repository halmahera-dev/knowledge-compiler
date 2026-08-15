-- Browser extensions a person has vouched for.
--
-- Every unpacked install gets its own chrome-extension://<id> origin, so the
-- allowlist cannot live in configuration: one env value trusts exactly one
-- machine. Registration requires a signed-in session, which is what keeps this
-- from being a wildcard — a malicious extension cannot add itself.

-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- CreateTable
CREATE TABLE "extension_origins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" STRING NOT NULL,
    "origin" STRING NOT NULL,
    "label" STRING NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_origins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "extension_origins_user_origin_key" ON "extension_origins"("user_id", "origin");

-- CreateIndex
CREATE INDEX "extension_origins_origin_idx" ON "extension_origins"("origin");
