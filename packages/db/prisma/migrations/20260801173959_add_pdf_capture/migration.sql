-- CockroachDB v25.4+ creates tables with schema_locked = true by default, which
-- makes changefeeds faster but rejects the ALTER TABLE ... ADD CONSTRAINT
-- statements Prisma emits for foreign keys. Disabling it for this session lets
-- the migration run as generated; new tables revert to the default afterwards.
SET create_table_with_schema_locked = off;

-- AlterEnum
ALTER TYPE "capture_type" ADD VALUE 'pdf';
