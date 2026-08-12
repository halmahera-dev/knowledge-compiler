-- pgvector: needed before any column can use the `vector` type.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "capture_type" AS ENUM ('paste', 'clip', 'link');

-- CreateEnum
CREATE TYPE "item_status" AS ENUM ('pending', 'processing', 'compiled', 'failed');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "node_kind" AS ENUM ('topic', 'entity');

-- CreateEnum
CREATE TYPE "gap_status" AS ENUM ('open', 'dismissed', 'filled');

-- CreateEnum
CREATE TYPE "claim_status" AS ENUM ('asserted', 'disputed', 'superseded');

-- CreateEnum
CREATE TYPE "source_stance" AS ENUM ('supports', 'contradicts');

-- CreateEnum
CREATE TYPE "edge_relation" AS ENUM ('extends', 'contradicts', 'prerequisite_of', 'example_of', 'related_to');

-- CreateTable
CREATE TABLE "raw_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "capture_type" "capture_type" NOT NULL,
    "source_url" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1024),
    "embedding_model" TEXT,
    "status" "item_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "embedding" vector(1024),
    "embedding_model" TEXT,
    "current_revision_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_page_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" JSONB NOT NULL DEFAULT '[]',
    "diff" JSONB NOT NULL DEFAULT '{}',
    "compile_run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "status" "claim_status" NOT NULL DEFAULT 'asserted',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_id" UUID NOT NULL,
    "raw_item_id" UUID NOT NULL,
    "quote" TEXT NOT NULL DEFAULT '',
    "char_start" INTEGER,
    "char_end" INTEGER,
    "stance" "source_stance" NOT NULL DEFAULT 'supports',

    CONSTRAINT "claim_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_page_sources" (
    "page_id" UUID NOT NULL,
    "raw_item_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_page_sources_pkey" PRIMARY KEY ("page_id","raw_item_id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "wiki_page_id" UUID,
    "label" TEXT NOT NULL,
    "kind" "node_kind" NOT NULL DEFAULT 'topic',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "target_node_id" UUID NOT NULL,
    "relation" "edge_relation" NOT NULL DEFAULT 'related_to',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "evidence_raw_item_id" UUID,
    "created_by_run_id" UUID,
    "withdrawn_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compile_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "raw_item_id" UUID NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'queued',
    "mastra_run_id" TEXT,
    "diff" JSONB,
    "error" TEXT,
    "raw_output" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compile_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_gaps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "node_id" UUID,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "gap_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_items_user_created_idx" ON "raw_items"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "raw_items_user_content_hash_key" ON "raw_items"("user_id", "content_hash");

-- CreateIndex
CREATE INDEX "wiki_pages_user_updated_idx" ON "wiki_pages"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_pages_user_slug_key" ON "wiki_pages"("user_id", "slug");

-- CreateIndex
CREATE INDEX "wiki_page_revisions_page_idx" ON "wiki_page_revisions"("page_id", "revision_no" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_page_revisions_page_no_key" ON "wiki_page_revisions"("page_id", "revision_no");

-- CreateIndex
CREATE INDEX "wiki_claims_revision_idx" ON "wiki_claims"("revision_id", "position");

-- CreateIndex
CREATE INDEX "claim_sources_claim_idx" ON "claim_sources"("claim_id");

-- CreateIndex
CREATE INDEX "claim_sources_item_idx" ON "claim_sources"("raw_item_id");

-- CreateIndex
CREATE INDEX "graph_nodes_page_idx" ON "graph_nodes"("wiki_page_id");

-- CreateIndex
CREATE UNIQUE INDEX "graph_nodes_user_label_key" ON "graph_nodes"("user_id", "label");

-- CreateIndex
CREATE INDEX "graph_edges_user_idx" ON "graph_edges"("user_id");

-- CreateIndex
CREATE INDEX "graph_edges_run_idx" ON "graph_edges"("created_by_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "graph_edges_triple_key" ON "graph_edges"("source_node_id", "target_node_id", "relation");

-- CreateIndex
CREATE INDEX "compile_runs_user_created_idx" ON "compile_runs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "compile_runs_item_idx" ON "compile_runs"("raw_item_id");

-- CreateIndex
CREATE INDEX "knowledge_gaps_user_status_idx" ON "knowledge_gaps"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_gaps_user_question_key" ON "knowledge_gaps"("user_id", "question");

-- AddForeignKey
ALTER TABLE "wiki_page_revisions" ADD CONSTRAINT "wiki_page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_claims" ADD CONSTRAINT "wiki_claims_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_claims" ADD CONSTRAINT "wiki_claims_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "wiki_page_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "wiki_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_raw_item_id_fkey" FOREIGN KEY ("raw_item_id") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page_sources" ADD CONSTRAINT "wiki_page_sources_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_page_sources" ADD CONSTRAINT "wiki_page_sources_raw_item_id_fkey" FOREIGN KEY ("raw_item_id") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_wiki_page_id_fkey" FOREIGN KEY ("wiki_page_id") REFERENCES "wiki_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_evidence_raw_item_id_fkey" FOREIGN KEY ("evidence_raw_item_id") REFERENCES "raw_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compile_runs" ADD CONSTRAINT "compile_runs_raw_item_id_fkey" FOREIGN KEY ("raw_item_id") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL: vector indexes
--
-- Prisma cannot express vector indexes in schema.prisma, and `prisma migrate dev`
-- deletes hand-added ones because it reads them as schema drift
-- (pgvector/pgvector-node#18). They are therefore appended here.
--
-- Cosine, because embeddings are compared by direction not magnitude. These
-- accelerate the "which existing page does this item belong to" query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "wiki_pages_embedding_idx"
    ON "wiki_pages" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "raw_items_embedding_idx"
    ON "raw_items" USING hnsw ("embedding" vector_cosine_ops);
