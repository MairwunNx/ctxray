import type { HarnessId } from "#shared/contract/index.ts";
import type { HarnessProfile } from "./profile.ts";

// Verdicts of the stage 0 spikes, one harness each. Update them as the harnesses change.
export const PROFILES: Record<HarnessId, HarnessProfile> = {
  "claude-code": {
    id: "claude-code",
    title: "Claude Code",
    modes: ["static", "capture", "observe"],
    experimentalModes: [],
    capabilities: ["skills", "pathRules", "mcp", "hooks", "headless", "proxyable"],
  },
  codex: {
    id: "codex",
    title: "Codex",
    modes: ["static", "capture", "observe"],
    experimentalModes: [],
    // The AGENTS.md chain is fixed at session start: nothing loads when the agent reads a file.
    capabilities: ["skills", "mcp", "hooks", "headless", "proxyable"],
  },
  "gemini-cli": {
    id: "gemini-cli",
    title: "Gemini CLI",
    modes: ["static", "capture", "observe"],
    experimentalModes: [],
    capabilities: ["skills", "pathRules", "mcp", "hooks", "headless", "proxyable"],
  },
  opencode: {
    id: "opencode",
    title: "OpenCode",
    modes: ["static", "capture", "observe"],
    experimentalModes: [],
    capabilities: ["skills", "pathRules", "mcp", "hooks", "headless", "proxyable"],
  },
  "cursor-cli": {
    id: "cursor-cli",
    title: "Cursor CLI",
    modes: ["static", "observe"],
    // Capture needs Cursor's hidden local build, which takes a base URL.
    experimentalModes: ["capture"],
    capabilities: ["skills", "pathRules", "intentRules", "mcp", "hooks", "headless"],
  },
};
