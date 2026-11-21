import { relative } from "node:path";
import { PROFILES } from "#entities/harness/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, span, type View } from "#shared/render/index.ts";
import type { McpAddOutcome } from "../add.action.ts";

export const AGENTS: readonly HarnessId[] = ["claude-code", "codex", "gemini-cli", "opencode", "cursor-cli"];

// A person who runs `ctxray mcp` in a terminal gets the commands that connect it instead of a silent wait.
export const setupView = (t: Translate): View => [
  [span(` ${t("mcp.setup")}`)],
  [],
  ...columns(
    AGENTS.map((agent) => [span(`   ${PROFILES[agent].title}`, "strong"), span(`ctxray mcp add ${agent}`, "accent")]),
  ),
  [],
  [span(` ${t("mcp.setupNext")}`, "muted")],
];

// `~/.cursor/mcp.json` and `.mcp.json`: the home and the project read shorter than full paths.
const shown = (file: string, home: string, cwd: string) => {
  const near = relative(cwd, file);
  if (!near.startsWith("..")) return near;
  const fromHome = relative(home, file);
  return fromHome.startsWith("..") ? file : `~/${fromHome}`;
};

export const addView = (agent: HarnessId, outcome: McpAddOutcome, t: Translate, home: string, cwd: string): View => {
  const title = PROFILES[agent].title;
  switch (outcome.kind) {
    case "already":
      return [
        [span(" · ", "muted"), span(t("mcp.already", { agent: title, file: shown(outcome.target.file, home, cwd) }))],
      ];
    case "written":
      return [
        [span(" ✓ ", "success"), span(t("mcp.written", { agent: title, file: shown(outcome.target.file, home, cwd) }))],
      ];
    case "ran":
      return [[span(" ✓ ", "success"), span(t("mcp.ran", { agent: title, command: outcome.command }))]];
    case "noBinary":
      return [[span(" ✗ ", "failure"), span(t("mcp.noBinary", { agent: title, binary: outcome.binary }), "failure")]];
    case "failed":
      return [
        [
          span(" ✗ ", "failure"),
          span(t("mcp.failed", { command: outcome.command, output: outcome.output }), "failure"),
        ],
      ];
    case "comments": {
      const { file, key, entry } = outcome.target;
      const params = { file: shown(file, home, cwd), key, entry: JSON.stringify({ ctxray: entry }) };
      return [[span(" ✗ ", "failure"), span(t("mcp.comments", params), "failure")]];
    }
  }
};
