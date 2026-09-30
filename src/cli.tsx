import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { relaunchIfNeeded } from "../scripts/node26.mjs";
import { createSession, dispatch } from "./index.mjs";
import { App } from "./tui/App.js";

const cmd = process.argv[2];

if (cmd === "keygen" || cmd === "selftest" || !process.stdin.isTTY) {
  try {
    await dispatch(cmd);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
} else {
  relaunchIfNeeded([
    "--env-file-if-exists=.env",
    "--import",
    "tsx",
    "src/cli.tsx",
    ...process.argv.slice(2),
  ]);
  try {
    const session = createSession();
    const renderer = await createCliRenderer({ exitOnCtrlC: false });
    createRoot(renderer).render(<App session={session} />);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
