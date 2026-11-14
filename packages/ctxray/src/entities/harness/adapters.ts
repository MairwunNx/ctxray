import type { HarnessId } from "#shared/contract/index.ts";
import type { CaptureAdapter } from "./capture/model.ts";
import { CLAUDE_CODE_CAPTURE } from "./claude-code/capture.ts";
import { discoverClaudeCode } from "./claude-code/discover.ts";
import { resolveClaudeCode } from "./claude-code/resolve.ts";
import { CODEX_CAPTURE } from "./codex/capture.ts";
import { discoverCodex } from "./codex/discover.ts";
import { resolveCodex } from "./codex/resolve.ts";
import type { Inventory } from "./inventory.ts";
import type { Project } from "./project.ts";
import type { Scope, StaticLoadout } from "./static-loadout.ts";

// L1–L3 for one harness: find what it could load, then predict what it loads for a cwd and a working set.
export type StaticAdapter = {
  discover: (project: Project) => Promise<Inventory>;
  resolve: (inventory: Inventory, scope: Scope) => StaticLoadout;
};

// The other harnesses join in stage 13.
export const STATIC_ADAPTERS: Partial<Record<HarnessId, StaticAdapter>> = {
  "claude-code": { discover: discoverClaudeCode, resolve: resolveClaudeCode },
  codex: { discover: discoverCodex, resolve: resolveCodex },
};

// L4–L7: launch the harness against ctxray's proxy and read what it sent.
export const CAPTURE_ADAPTERS: Partial<Record<HarnessId, CaptureAdapter>> = {
  "claude-code": CLAUDE_CODE_CAPTURE,
  codex: CODEX_CAPTURE,
};
