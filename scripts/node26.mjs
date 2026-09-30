// OpenTUI needs Node 26.4+ for node:ffi. Pick that binary when the current one is older.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function rendererNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 26 || (major === 26 && minor >= 4)) return process.execPath;
  try {
    const root = join(homedir(), ".nvm/versions/node");
    const versions = readdirSync(root)
      .filter((name) => name.startsWith("v26.") && Number(name.split(".")[1]) >= 4)
      .sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1]));
    const latest = versions.at(-1);
    if (latest) return join(root, latest, "bin", "node");
  } catch {
    /* nvm is not installed */
  }
  return null;
}

/** Re-exec `args` on a new enough Node. Returns when the current process is already new enough. */
export function relaunchIfNeeded(args) {
  const bin = rendererNode();
  if (!bin) {
    console.error(`Tendril dashboard needs Node.js 26.4+. Current is ${process.version}.`);
    process.exit(1);
  }
  if (bin === process.execPath) return;
  const child = spawnSync(bin, args, {
    stdio: "inherit",
    env: { ...process.env, TENDRIL_NODE_REEXEC: "1" },
  });
  process.exit(child.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  relaunchIfNeeded(process.argv.slice(2));
  const child = spawnSync(process.execPath, process.argv.slice(2), { stdio: "inherit" });
  process.exit(child.status ?? 1);
}
