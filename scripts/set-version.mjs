#!/usr/bin/env node
// Bump the release version across every version-bearing file in one step.
// Usage: node scripts/set-version.mjs <major|minor|patch|X.Y.Z>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = process.argv[2];

if (!spec) {
  console.error("Usage: node scripts/set-version.mjs <major|minor|patch|X.Y.Z>");
  process.exit(1);
}

const sourceOfTruth = join(root, "mcp-server/package.json");
const current = JSON.parse(readFileSync(sourceOfTruth, "utf8")).version;

function nextVersion(cur, s) {
  if (/^\d+\.\d+\.\d+([-+].+)?$/.test(s)) return s;
  const [maj, min, pat] = cur.split(".").map(Number);
  if (s === "major") return `${maj + 1}.0.0`;
  if (s === "minor") return `${maj}.${min + 1}.0`;
  if (s === "patch") return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Invalid version spec: "${s}" (expected major|minor|patch|X.Y.Z)`);
}

const next = nextVersion(current, spec);

// Manifests: replace only the top-level version string so the diff stays a
// single line (JSON round-tripping would reflow their inline arrays).
function bumpManifest(rel) {
  const p = join(root, rel);
  const text = readFileSync(p, "utf8");
  let replaced = false;
  const out = text.replace(/"version":\s*"[^"]+"/, () => {
    replaced = true;
    return `"version": "${next}"`;
  });
  if (!replaced) throw new Error(`No top-level "version" found in ${rel}`);
  writeFileSync(p, out);
}

const files = [
  "mcp-server/package.json",
  "gemini-extension.json",
  "claude-code/.claude-plugin/plugin.json",
];
for (const rel of files) bumpManifest(rel);

// Lockfile is already canonical JSON with many nested version keys; touch only
// the two project-level ones via a structured edit.
const lockPath = join(root, "mcp-server/package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
lock.version = next;
if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");

console.log(`${current} -> ${next}`);
console.log(`Updated: ${files.join(", ")}, mcp-server/package-lock.json`);
