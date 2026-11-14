import type { HarnessId } from "#shared/contract/index.ts";
import type { CaptureAdapter } from "./capture/model.ts";
import { CLAUDE_CODE_CAPTURE } from "./claude-code/capture.ts";
import { discoverClaudeCode } from "./claude-code/discover.ts";
import { resolveClaudeCode } from "./claude-code/resolve.ts";
import { CODEX_CAPTURE } from "./codex/capture.ts";
import { discoverCodex } from "./codex/discover.ts";
import { resolveCodex } from "./codex/resolve.ts";
import { CURSOR_CLI_CAPTURE } from "./cursor/capture.ts";
import { discoverCursor } from "./cursor/discover.ts";
import { resolveCursor } from "./cursor/resolve.ts";
import { GEMINI_CLI_CAPTURE } from "./gemini-cli/capture.ts";
import { discoverGeminiCli } from "./gemini-cli/discover.ts";
import { resolveGeminiCli } from "./gemini-cli/resolve.ts";
import type { Inventory } from "./inventory.ts";
import { OPENCODE_CAPTURE } from "./opencode/capture.ts";
import { discoverOpencode } from "./opencode/discover.ts";
import { resolveOpencode } from "./opencode/resolve.ts";
import { PROFILES } from "./profiles.ts";
import type { Project } from "./project.ts";
import type { Scope, StaticLoadout } from "./static-loadout.ts";

// L1–L3 for one harness: find what it could load, then predict what it loads for a cwd and a working set.
export type StaticAdapter = {
  discover: (project: Project) => Promise<Inventory>;
  resolve: (inventory: Inventory, scope: Scope) => StaticLoadout;
};

export const STATIC_ADAPTERS: Partial<Record<HarnessId, StaticAdapter>> = {
  "claude-code": { discover: discoverClaudeCode, resolve: resolveClaudeCode },
  codex: { discover: discoverCodex, resolve: resolveCodex },
  "gemini-cli": { discover: discoverGeminiCli, resolve: resolveGeminiCli },
  opencode: { discover: discoverOpencode, resolve: resolveOpencode },
  "cursor-cli": { discover: (project) => discoverCursor(project, "cursor-cli"), resolve: resolveCursor("cursor-cli") },
  "cursor-ide": { discover: (project) => discoverCursor(project, "cursor-ide"), resolve: resolveCursor("cursor-ide") },
  // The Code tab of the Claude app runs Claude Code and reads the same project files (ADR 0011).
  "claude-code-desktop": {
    discover: async (project) => ({ ...(await discoverClaudeCode(project)), harness: "claude-code-desktop" }),
    resolve: (inventory, scope) => ({ ...resolveClaudeCode(inventory, scope), harness: "claude-code-desktop" }),
  },
};

// Harnesses a run without a config takes: every one ctxray reads, less an editor that reads its CLI's files.
export const DEFAULT_HARNESSES = (Object.keys(STATIC_ADAPTERS) as HarnessId[]).filter((id) => !PROFILES[id].twin);

// L4–L7: launch the harness against ctxray's proxy and read what it sent.
export const CAPTURE_ADAPTERS: Partial<Record<HarnessId, CaptureAdapter>> = {
  "claude-code": CLAUDE_CODE_CAPTURE,
  codex: CODEX_CAPTURE,
  "gemini-cli": GEMINI_CLI_CAPTURE,
  opencode: OPENCODE_CAPTURE,
  "cursor-cli": CURSOR_CLI_CAPTURE,
};
