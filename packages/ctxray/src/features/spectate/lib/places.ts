import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

// Where the hooks write what they see. It's ctxray's own state, never a harness's folder, and stays on this machine.
export const spectateDir = (env: Env, os: string = process.platform, home: string = homedir()) => {
  const own = present(env["CTXRAY_STATE_DIR"]);
  if (own !== undefined) return join(own, "spectate");
  if (os === "darwin") return join(home, "Library", "Application Support", "ctxray", "spectate");
  if (os === "win32") return join(present(env["LOCALAPPDATA"]) ?? join(home, "AppData", "Local"), "ctxray", "spectate");
  return join(present(env["XDG_STATE_HOME"]) ?? join(home, ".local", "state"), "ctxray", "spectate");
};

// The two hook systems ctxray observes through: Claude Code's settings and Cursor's hooks.json. Both fire in
// their desktop apps too, which ctxray doesn't tell apart (ADR 0010, 0011).
export type Family = "claude" | "cursor";

export const FAMILIES: Record<Family, { harnesses: readonly HarnessId[]; events: readonly string[] }> = {
  claude: {
    harnesses: ["claude-code"],
    events: ["SessionStart", "InstructionsLoaded", "UserPromptSubmit", "SessionEnd"],
  },
  cursor: {
    harnesses: ["cursor-cli"],
    events: ["sessionStart", "beforeSubmitPrompt", "beforeReadFile", "stop"],
  },
};

export const familyOf = (harness: HarnessId): Family | undefined =>
  (Object.keys(FAMILIES) as Family[]).find((family) => FAMILIES[family].harnesses.includes(harness));

// The user-level file each family reads its hooks from.
export const hooksFile = (family: Family, env: Env, home: string = homedir()) =>
  family === "claude"
    ? join(present(env["CLAUDE_CONFIG_DIR"]) ?? join(home, ".claude"), "settings.json")
    : join(home, ".cursor", "hooks.json");
