#!/usr/bin/env node
/**
 * Brings up CockroachDB + Redis and prepares the cluster for the app.
 *
 * Prefers containers that already exist on the machine (`docker start`) over
 * `docker compose up`, because creating a second container on the same ports
 * would fail and a second cockroach node on a fresh volume would silently give
 * you an empty database.
 *
 * Beyond starting containers this also does two things the app cannot do for
 * itself on first run:
 *   - enables the vector-index cluster setting (off by default in CockroachDB)
 *   - creates the `knowledge_base` database named in COCKROACH_URL
 */
import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CONTAINERS = ["cockroachdb", "redis"];
const READY_TIMEOUT_MS = 90_000;

function docker(args, { capture = true } = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  }).trim();
}

function tryDocker(args) {
  const res = spawnSync("docker", args, { encoding: "utf8" });
  return { ok: res.status === 0, out: (res.stdout ?? "") + (res.stderr ?? "") };
}

function containerState(name) {
  const res = spawnSync("docker", ["inspect", name, "--format", "{{.State.Status}}"], {
    encoding: "utf8",
  });
  if (res.status !== 0) return "missing";
  return res.stdout.trim();
}

async function ensureContainers() {
  const missing = [];

  for (const name of CONTAINERS) {
    const state = containerState(name);
    if (state === "running") {
      console.log(`  ${name}: already running`);
    } else if (state === "missing") {
      missing.push(name);
    } else {
      process.stdout.write(`  ${name}: ${state} -> starting... `);
      const { ok, out } = tryDocker(["start", name]);
      console.log(ok ? "ok" : `FAILED\n${out}`);
      if (!ok) throw new Error(`could not start container ${name}`);
    }
  }

  if (missing.length > 0) {
    console.log(`  ${missing.join(", ")}: not present -> docker compose up -d`);
    const { ok, out } = tryDocker(["compose", "up", "-d"]);
    if (!ok) {
      // The compose file declares cockroach_data as an external volume so it can
      // adopt an existing one; on a truly fresh machine that volume won't exist.
      if (out.includes("cockroach_data")) {
        console.log("  creating missing cockroach_data volume...");
        docker(["volume", "create", "cockroach_data"]);
        const retry = tryDocker(["compose", "up", "-d"]);
        if (!retry.ok) throw new Error(`docker compose up failed:\n${retry.out}`);
      } else {
        throw new Error(`docker compose up failed:\n${out}`);
      }
    }
  }
}

/** Runs SQL inside the cockroach container, so no local client is required. */
function crdb(sql) {
  return tryDocker([
    "exec",
    "cockroachdb",
    "cockroach",
    "sql",
    "--insecure",
    "--host=localhost:26257",
    "--format=tsv",
    "-e",
    sql,
  ]);
}

async function waitForCockroach() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  process.stdout.write("  waiting for cockroachdb to accept SQL... ");
  while (Date.now() < deadline) {
    if (crdb("SELECT 1").ok) {
      console.log("ready");
      return;
    }
    await sleep(2000);
  }
  console.log("TIMEOUT");
  throw new Error(
    `cockroachdb did not accept SQL within ${READY_TIMEOUT_MS / 1000}s. ` +
      `Check: docker logs cockroachdb`,
  );
}

async function waitForRedis() {
  const deadline = Date.now() + 30_000;
  process.stdout.write("  waiting for redis... ");
  while (Date.now() < deadline) {
    const res = tryDocker([
      "exec",
      "redis",
      "redis-cli",
      "-a",
      "redispw123",
      "--no-auth-warning",
      "PING",
    ]);
    if (res.ok && res.out.includes("PONG")) {
      console.log("ready");
      return;
    }
    await sleep(1000);
  }
  console.log("TIMEOUT");
  throw new Error("redis did not respond to PING. Check: docker logs redis");
}

async function prepareCluster() {
  // Vector indexes are gated behind a cluster setting and are not enabled by
  // default. Without this, CREATE VECTOR INDEX in the migration fails.
  process.stdout.write("  enabling feature.vector_index.enabled... ");
  const vec = crdb("SET CLUSTER SETTING feature.vector_index.enabled = true;");
  if (!vec.ok) {
    console.log("FAILED");
    throw new Error(
      `could not enable vector indexes — your CockroachDB may predate v25.2:\n${vec.out}`,
    );
  }
  console.log("ok");

  // `knowledge_base` is shared with an unrelated project whose tables live in
  // `public`. Ours live in `kc` so Prisma Migrate — which manages a whole schema
  // and drops what it does not recognise — can never touch them.
  // The shadow database is where Prisma Migrate diffs schema changes; CockroachDB
  // will not create one implicitly on a single-node insecure cluster.
  const steps = [
    ["creating database knowledge_base", "CREATE DATABASE IF NOT EXISTS knowledge_base;"],
    ["creating schema knowledge_base.kc", "CREATE SCHEMA IF NOT EXISTS knowledge_base.kc;"],
    ["creating shadow database", "CREATE DATABASE IF NOT EXISTS knowledge_base_shadow;"],
    ["creating shadow schema", "CREATE SCHEMA IF NOT EXISTS knowledge_base_shadow.kc;"],
  ];

  for (const [label, stmt] of steps) {
    process.stdout.write(`  ${label}... `);
    const res = crdb(stmt);
    if (!res.ok) {
      console.log("FAILED");
      throw new Error(res.out);
    }
    console.log("ok");
  }

  const version = crdb("SELECT version();");
  if (version.ok) {
    const line = version.out.split("\n").find((l) => l.includes("CockroachDB"));
    if (line) console.log(`  ${line.trim().split(" (")[0]}`);
  }
}

async function main() {
  console.log("Bringing up local dependencies");
  await ensureContainers();
  await waitForCockroach();
  await waitForRedis();
  await prepareCluster();
  console.log("\nReady. Next: pnpm db:migrate");
}

main().catch((err) => {
  console.error(`\ndb:up failed — ${err.message}`);
  process.exit(1);
});
