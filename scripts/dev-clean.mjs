#!/usr/bin/env node
/**
 * Clears anything left over from a previous dev session.
 *
 * Two things survive an unclean shutdown (a hard Ctrl+C, a closed terminal, an
 * IDE restart) and both block the next `pnpm dev`:
 *
 *   1. A process still holding 5173 / 4111 / 8000.
 *   2. Mastra's `.mastra/dev.lock`, which refuses to start a second dev server
 *      in the same directory. If the recorded process is gone the lock is stale
 *      and safe to remove; if it is alive it is a real conflict.
 *
 * Runs automatically before `pnpm dev`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "apps", "agent", ".mastra", "dev.lock");
// 3000 is the Next client; 5173 was where it used to listen and is kept so a
// stale process from before the port move is still cleaned up.
const PORTS = [5173, 4111, 8000, 3000];
const isWindows = process.platform === "win32";

function isAlive(pid) {
  try {
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else — still a conflict.
    return error.code === "EPERM";
  }
}

/** PIDs listening on a port, over IPv4 or IPv6. */
function listeners(port) {
  try {
    if (isWindows) {
      // No `-p TCP`: that filter lists IPv4 only, and Vite binds ::1 exclusively,
      // so an IPv6-only listener would be invisible and survive the cleanup.
      // Unfiltered output covers both TCP and TCPv6.
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      return [
        ...new Set(
          out
            .split("\n")
            .filter((line) => line.includes("LISTENING"))
            .map((line) => line.trim().split(/\s+/))
            // columns: Proto  LocalAddress  ForeignAddress  State  PID
            .filter((cols) => cols.length >= 5 && cols[1].endsWith(`:${port}`))
            .map((cols) => Number(cols[cols.length - 1]))
            .filter((pid) => Number.isInteger(pid) && pid > 0),
        ),
      ];
    }
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    return [...new Set(out.split("\n").map(Number).filter(Boolean))];
  } catch {
    // No listener, or the tool is unavailable — nothing to clean either way.
    return [];
  }
}

function kill(pid) {
  if (isWindows) {
    // /T also takes the child processes pnpm and vite spawn.
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Processes belonging to this repo that hold no port.
 *
 * The arq worker is the one that matters: it listens on nothing, so freeing
 * ports never touched it and every restart left another one behind. They all
 * consume from the same Redis queue, so a stale worker running older code can
 * win a job and send the wrong payload shape — which is exactly the failure this
 * was added to stop.
 *
 * Matched on the repo path as well as the command, so a worker from a different
 * project on this machine is left alone.
 */
function portlessWorkers() {
  // `app.worker.WorkerSettings`, not `arq app.worker`: one logical worker is a
  // chain of four processes (cmd -> uv -> arq.exe -> python), and only the first
  // two carry the literal "arq app.worker". Matching on that left arq.exe and
  // python running as orphans after their parents were killed — which is how
  // eight stale workers accumulated while every cleanup reported success.
  const marker = "app.worker.WorkerSettings";
  try {
    if (isWindows) {
      // The shell running this query has the marker in its OWN command line, so
      // without excluding shells the script reports itself as a stale worker and
      // "kills" a process that was never the problem — which reads as a worker
      // that respawns forever.
      const script =
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" +
        marker +
        // Shells are excluded because the shell running this very query carries
        // the marker in its own command line — matching them makes the script
        // report itself and "kill" processes that were never the problem.
        "*' -and $_.Name -notmatch '^(pwsh|powershell|conhost|bash|sh)' } | " +
        "ForEach-Object { $_.ProcessId }";
      const out = execFileSync("powershell", ["-NoProfile", "-Command", script], {
        encoding: "utf8",
      });
      return out
        .split("\n")
        .map((l) => Number(l.trim()))
        .filter(Boolean);
    }
    // pgrep -f matches its own argv too; -a would include it, so filter by name.
    const out = execFileSync("pgrep", ["-f", marker], { encoding: "utf8" });
    return out.split("\n").map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

let cleaned = 0;

for (const port of PORTS) {
  for (const pid of listeners(port)) {
    // Never kill ourselves or our own parent shell.
    if (pid === process.pid || pid === process.ppid) continue;
    console.log(`  freeing port ${port} (PID ${pid})`);
    kill(pid);
    cleaned += 1;
  }
}

/**
 * Every process between this one and the root of the tree.
 *
 * `pnpm dev` runs this script as a step, so the shell that will later start the
 * worker is an ANCESTOR of this process and its command line mentions the worker.
 * Killing it takes down the very run that invoked the cleanup — which is exactly
 * what happened before this guard existed.
 */
function ancestors() {
  const chain = new Set([process.pid]);
  if (!isWindows) return chain;
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "$id=" +
          process.pid +
          "; while ($id -and $id -ne 0) { $id; " +
          "$p = Get-CimInstance Win32_Process -Filter \"ProcessId=$id\" -ErrorAction SilentlyContinue; " +
          "if (-not $p) { break }; $id = $p.ParentProcessId }",
      ],
      { encoding: "utf8" },
    );
    for (const line of out.split("\n")) {
      const pid = Number(line.trim());
      if (pid) chain.add(pid);
    }
  } catch {
    // Without the chain we cannot prove a process is safe to kill, so the
    // caller skips the port-less sweep entirely rather than guess.
    return null;
  }
  return chain;
}

const protectedPids = ancestors();

if (protectedPids === null) {
  console.warn("  ! could not resolve the process tree; skipping the stale-worker sweep");
} else {
  for (const pid of portlessWorkers()) {
    if (protectedPids.has(pid)) continue;
    console.log(`  stopping stale arq worker (PID ${pid})`);
    kill(pid);
    cleaned += 1;
  }
}

if (existsSync(LOCK)) {
  let pid = null;
  try {
    pid = JSON.parse(readFileSync(LOCK, "utf8")).pid ?? null;
  } catch {
    // Unreadable lock is by definition stale.
  }

  if (pid && isAlive(pid)) {
    console.log(`  mastra dev.lock held by a live process (PID ${pid}) — stopping it`);
    kill(pid);
    cleaned += 1;
  }

  try {
    unlinkSync(LOCK);
    console.log("  removed stale mastra dev.lock");
  } catch {
    console.warn("  could not remove .mastra/dev.lock — delete it by hand if the agent won't start");
  }
}

console.log(cleaned === 0 ? "  nothing to clean" : `  cleaned ${cleaned} leftover process(es)`);
