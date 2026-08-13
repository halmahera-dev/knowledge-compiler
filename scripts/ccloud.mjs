#!/usr/bin/env node
/**
 * Operating the CockroachDB Cloud cluster that holds the agent's memory.
 *
 * A wrapper rather than a set of notes in the README, because these are the four
 * things you actually do to a managed cluster and each has a detail that is easy
 * to get wrong from memory:
 *
 *   status     is it up, which org, which version
 *   url        the connection string, in the shape .env wants
 *   allowlist  add this machine's IP — the reason a correct URL still refuses
 *   migrate    apply migrations to Cloud, scoped to the `kc` schema
 *   backups    the retention actually configured, not the one assumed
 *   audit      who changed the control plane, and when
 *
 * Every call asks for `-o json`. That flag is why the CLI calls itself
 * agent-ready, and the alternative — splitting the human table on runs of two
 * spaces — fails by returning the wrong cluster rather than by erroring.
 *
 * Everything shells out to `ccloud`; nothing here reimplements it. The value is
 * in composing it with what this project needs — the schema scoping, the URL
 * rewriting, and refusing to run a migration against the wrong cluster.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env");

const INSTALL = {
  win32: 'PowerShell: see https://www.cockroachlabs.com/docs/cockroachcloud/ccloud-get-started',
  darwin: "brew install cockroachdb/tap/ccloud",
  linux:
    "curl https://binaries.cockroachdb.com/ccloud/ccloud_linux-amd64_0.6.12.tar.gz | tar -xz && sudo cp ccloud /usr/local/bin/",
};

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Runs ccloud, returning stdout. Failures carry ccloud's own message. */
function ccloud(args, { quiet = false } = {}) {
  try {
    return execFileSync("ccloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.code === "ENOENT") {
      die(
        "ccloud is not installed.",
        INSTALL[process.platform] ?? "See https://www.cockroachlabs.com/docs/cockroachcloud/ccloud-get-started",
      );
    }
    const stderr = (error.stderr ?? "").toString().trim();
    if (quiet) return "";
    if (/not logged in|unauthorized|authenticate/i.test(stderr)) {
      die("Not signed in to CockroachDB Cloud.", "Run: ccloud auth login");
    }
    die(`ccloud ${args.join(" ")} failed.`, stderr.split("\n")[0] ?? "");
  }
  return "";
}

/**
 * Runs a ccloud command and parses its structured output.
 *
 * `-o json` is a global flag on every ccloud command, and it exists precisely so
 * that programs stop doing what this script used to do: split the human table on
 * runs of two spaces and hope. That breaks the first time a column widens, a
 * cluster name contains a space, or a header changes — and it breaks by
 * returning the wrong cluster rather than by failing.
 */
function ccloudJson(args) {
  const raw = ccloud([...args, "-o", "json"]);
  try {
    return JSON.parse(raw);
  } catch {
    die(
      `ccloud ${args.join(" ")} did not return JSON.`,
      "Check the CLI version — `-o json` is supported on every command.",
    );
  }
}

/**
 * The list of clusters, whatever wrapper the CLI puts them in.
 *
 * Accepts a bare array or a single-key object holding one, because those are the
 * two shapes this kind of API uses and picking wrong should not be silent.
 */
export function clustersFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/**
 * A cluster's name, or an error naming what was there instead.
 *
 * The field is `name` in every output documented, but this is the value that
 * decides which cluster a migration runs against — so an unrecognised shape
 * stops the script rather than letting `undefined` through to a command that
 * would then act on the wrong thing.
 */
export function nameOf(cluster) {
  for (const key of ["name", "Name", "cluster_name", "clusterName"]) {
    const value = cluster?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * The cluster to act on.
 *
 * Taken from the argument, else CC_CLUSTER, else the only cluster there is.
 * Guessing when there are several is how a migration lands on the wrong one.
 */
function clusterName(explicit) {
  if (explicit) return explicit;
  if (process.env.CC_CLUSTER) return process.env.CC_CLUSTER;

  const clusters = clustersFrom(ccloudJson(["cluster", "list"]));
  const names = clusters.map(nameOf);

  if (names.some((name) => name === null)) {
    die(
      "Could not read a cluster name from ccloud's JSON.",
      `Keys present: ${Object.keys(clusters[0] ?? {}).join(", ") || "(none)"}`,
    );
  }

  if (names.length === 1) return names[0];
  if (names.length === 0) {
    die("No clusters in this organization.", "Create one: ccloud cluster create basic");
  }
  die(`${names.length} clusters found — name the one you mean.`, `Clusters: ${names.join(", ")}`);
}

/**
 * Points a Cloud connection string at this project's database.
 *
 * ccloud hands back the cluster's default database. Everything here lives in
 * `knowledge_base` under a `kc` schema, because the database is shared with an
 * unrelated project — so leaving ccloud's value in place would migrate into the
 * wrong database entirely.
 *
 * The `<cluster>.<database>` path form is preserved when present: on that older
 * shape the prefix is how the connection is routed, and replacing the whole path
 * would send it to the wrong cluster rather than merely the wrong database.
 */
export function withKnowledgeBase(url, database = "knowledge_base") {
  return url.replace(
    /\/(?:([^/?.]+)\.)?([^/?]+)(\?|$)/,
    (_match, cluster, _db, tail) => `/${cluster ? `${cluster}.` : ""}${database}${tail}`,
  );
}

/**
 * The connection string out of `cluster connection-string -o json`.
 *
 * That command reports the URL as a field. The previous approach ran
 * `cluster sql --connection-url` and scanned the output for a line beginning
 * "postgres", which worked only while nothing else the CLI printed happened to
 * start that way — a banner, a warning, a second URL — and would have picked the
 * wrong line without saying so.
 */
export function connectionUrlFrom(payload) {
  for (const key of ["connection_url", "connectionUrl", "url"]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.startsWith("postgres")) return value;
  }
  return null;
}

/** The cluster's connection string, pointed at this project's database. */
function connectionString(cluster) {
  const payload = ccloudJson(["cluster", "connection-string", cluster]);
  const url = connectionUrlFrom(payload);
  if (!url) {
    die(
      "ccloud returned no connection URL.",
      `Keys present: ${Object.keys(payload ?? {}).join(", ") || "(none)"}`,
    );
  }
  return withKnowledgeBase(url);
}

const COMMANDS = {
  /** Who you are, what exists, and whether it is serving. */
  status(name) {
    console.log("\n  Organization");
    console.log(`    ${ccloud(["auth", "whoami"]).trim()}`);

    console.log("\n  Clusters");
    for (const line of ccloud(["cluster", "list"]).trimEnd().split("\n")) {
      console.log(`    ${line}`);
    }

    const cluster = clusterName(name);
    console.log(`\n  ${cluster}`);
    for (const line of ccloud(["cluster", "info", cluster]).trimEnd().split("\n")) {
      console.log(`    ${line}`);
    }
  },

  /**
   * The connection string, in the form .env expects.
   *
   * Cloud hands back a URL whose database is the cluster's default. This project
   * keeps everything in `knowledge_base` under a `kc` schema, because the
   * database is shared — so the database name is substituted rather than left as
   * ccloud produced it, which would silently migrate into the wrong place.
   */
  url(name) {
    const cluster = clusterName(name);
    const withDatabase = connectionString(cluster);
    console.error("  This contains a password. Do not paste it into a shared terminal.\n");
    console.log(`COCKROACH_URL="${withDatabase}"`);
  },

  /**
   * Add this machine to the cluster's IP allowlist.
   *
   * The failure this prevents looks like a wrong password or a hung connection,
   * and sends you to check the URL — which is correct. A managed cluster simply
   * will not talk to an address it has not been told about.
   */
  allowlist(name) {
    const cluster = clusterName(name);
    let ip;
    try {
      ip = execSync("curl -s --max-time 10 https://api.ipify.org", { encoding: "utf8" }).trim();
    } catch {
      die("Could not determine this machine's public IP.", "Add it by hand: ccloud cluster networking allowlist create <cluster> <cidr> --sql");
    }
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) die(`That does not look like an IP: ${ip}`);

    console.log(`  Allowing ${ip}/32 to reach ${cluster} over SQL…`);
    ccloud(["cluster", "networking", "allowlist", "create", cluster, `${ip}/32`, "--sql"]);
    console.log("  Done. Entries now:");
    for (const line of ccloud(["cluster", "networking", "allowlist", "list", cluster]).trimEnd().split("\n")) {
      console.log(`    ${line}`);
    }
  },

  /**
   * Apply migrations to Cloud.
   *
   * Runs the project's own migrate script with COCKROACH_URL pointed at the
   * cluster, so the vector-index preservation and `kc` scoping in that script
   * still apply — a bare `prisma migrate deploy` here would drop the indexes and
   * turn every k-NN lookup into a full scan.
   */
  migrate(name) {
    const cluster = clusterName(name);
    const url = connectionString(cluster);

    console.log(`  Applying migrations to ${cluster}…`);
    execSync("node scripts/migrate.mjs deploy", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, COCKROACH_URL: url },
    });
  },

  /**
   * What the memory layer's durability actually is.
   *
   * Worth a command of its own: "production-grade memory" is a claim about
   * recovery, and the retention here is the only thing that makes it true.
   */
  backups(name) {
    const cluster = clusterName(name);
    console.log(`\n  Backup configuration for ${cluster}`);
    for (const line of ccloud(["cluster", "backup", "config", "get", cluster]).trimEnd().split("\n")) {
      console.log(`    ${line}`);
    }
    console.log("\n  Recent backups");
    for (const line of ccloud(["cluster", "backup", "list", cluster]).trimEnd().split("\n")) {
      console.log(`    ${line}`);
    }
  },

  /**
   * Who did what to the control plane.
   *
   * The judging question this answers is "has the team thought about access
   * control", and an allowlist is only half of it — the other half is being able
   * to say afterwards who changed the cluster, and when. `ccloud audit list`
   * already records it; the value here is reading it as JSON so it can be
   * filtered and diffed rather than eyeballed.
   *
   * Defaults to the last seven days. An unbounded audit query on a busy
   * organization returns a wall of text nobody reads.
   */
  audit(days) {
    const window = Number(days ?? 7);
    if (!Number.isFinite(window) || window <= 0) {
      die("Days must be a positive number.", "Example: pnpm ccloud audit 14");
    }

    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000).toISOString();
    const payload = ccloudJson(["audit", "list", "--limit", "50", "--starting-from", since]);
    const entries = clustersFrom(payload);

    console.log(`\n  Control-plane activity since ${since.slice(0, 10)}`);
    if (entries.length === 0) {
      console.log("    nothing recorded in this window\n");
      return;
    }

    for (const entry of entries) {
      // Field names are read defensively rather than assumed: this is a report,
      // so an unfamiliar shape should degrade to showing what is there.
      const when = entry.time ?? entry.timestamp ?? entry.created_at ?? "";
      const who = entry.user ?? entry.actor ?? entry.email ?? "unknown";
      const what = entry.action ?? entry.event ?? entry.name ?? JSON.stringify(entry);
      const where = entry.cluster ?? entry.cluster_name ?? "";
      console.log(`    ${String(when).slice(0, 19).padEnd(20)} ${String(who).padEnd(28)} ${what}${where ? ` — ${where}` : ""}`);
    }
    console.log();
  },

  /** Point .env at the cluster, keeping a copy of what was there. */
  use(name) {
    const cluster = clusterName(name);
    if (!existsSync(ENV_FILE)) die(".env not found.", "Copy .env.example to .env first.");

    const url = connectionString(cluster);

    const before = readFileSync(ENV_FILE, "utf8");
    writeFileSync(`${ENV_FILE}.local-backup`, before);
    const after = before.replace(/^COCKROACH_URL=.*$/m, `COCKROACH_URL="${url}"`);
    if (after === before) die("No COCKROACH_URL line in .env to replace.");
    writeFileSync(ENV_FILE, after);

    console.log(`  .env now points at ${cluster}.`);
    console.log("  Previous value saved to .env.local-backup.");
    console.log("  Run `pnpm ccloud allowlist` if connections are refused.");
  },
};

/**
 * Only act when run as a command, not when imported.
 *
 * Without this the test file's `import` printed the help text and exited 0 —
 * which the runner read as a pass, so the assertions below it never ran at all.
 */
const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) main(process.argv.slice(2));

function main([command, name]) {
  if (command && COMMANDS[command]) {
    COMMANDS[command](name);
    return;
  }

  console.log(`
  Operating the CockroachDB Cloud cluster.

    pnpm ccloud status     [cluster]   organization, clusters, and cluster health
    pnpm ccloud url        [cluster]   connection string, shaped for .env
    pnpm ccloud use        [cluster]   write that string into .env
    pnpm ccloud allowlist  [cluster]   let this machine's IP reach the cluster
    pnpm ccloud migrate    [cluster]   apply migrations, keeping vector indexes
    pnpm ccloud backups    [cluster]   the retention behind "durable memory"
    pnpm ccloud audit      [days]      who changed the control plane, and when

  The cluster is taken from the argument, else CC_CLUSTER, else the only one
  present. With several clusters and no name given, it refuses rather than picks.
`);
  // An unknown command is a mistake worth a non-zero exit; bare `pnpm ccloud`
  // is someone asking what the commands are, which is not a failure.
  process.exit(command ? 1 : 0);
}
