#!/usr/bin/env node
/**
 * Packs `apps/extension` into a zip the web app can hand out.
 *
 * The extension is not on the Web Store, so the Capture page's only honest
 * offer is the folder itself. Producing it at build time rather than committing
 * a binary keeps the zip from drifting behind the source — a stale extension
 * that loads and then fails to save is worse than no download at all.
 *
 * Written with zlib and a hand-rolled zip container rather than a dependency.
 * The archive is a dozen small files with no compression subtleties, and the
 * central directory is about sixty lines; a package to avoid writing them would
 * be a supply-chain edge for no saving.
 *
 * Run by `pnpm pack:extension`, and by the web build before it copies `public/`.
 */
import { deflateRawSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "apps", "extension");
const OUT = join(ROOT, "apps", "web", "public", "knowledge-compiler-extension.zip");

/** Files that belong to the repository, not to the extension. */
const SKIP = new Set(["node_modules", "package.json", "README.md"]);
const SKIP_SUFFIX = [".test.js", ".test.mjs"];

function collect(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    if (SKIP_SUFFIX.some((suffix) => name.endsWith(suffix))) continue;

    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full, base));
    } else {
      out.push({ name: relative(base, full).replace(/\\/g, "/"), data: readFileSync(full) });
    }
  }
  return out;
}

/** CRC-32, which the zip format requires per entry. */
const TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    // Timestamps are fixed rather than taken from the clock, so identical
    // sources produce an identical archive and a rebuild is a no-op downstream.
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0, 42); // local header offset, filled below
    entry.writeUInt32LE(offset, 42);
    directory.push(Buffer.concat([entry, name]));

    offset += local.length + name.length + compressed.length;
  }

  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, central, end]);
}

const files = collect(SOURCE);
if (files.length === 0) {
  console.error("  apps/extension is empty — nothing to pack.");
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
const archive = zip(files);
writeFileSync(OUT, archive);

console.log(`  packed ${files.length} files into ${relative(ROOT, OUT)} (${(archive.length / 1024).toFixed(1)} KB)`);
