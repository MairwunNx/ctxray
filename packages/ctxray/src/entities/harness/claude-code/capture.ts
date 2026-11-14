import { join } from "node:path";
import type { CaptureAdapter } from "../capture/model.ts";
import { claudeCodeVersion, launchClaudeCode } from "./launch.ts";
import { segmentClaudeCode } from "./segment.ts";

// Claude Code at capture tier (ADR 0005). `Read` takes an absolute `file_path`, a skill goes through `Skill`.
export const CLAUDE_CODE_CAPTURE: CaptureAdapter = {
  binary: "claude",
  defaultModel: "claude-sonnet-5-5",
  version: claudeCodeVersion,
  launch: launchClaudeCode,
  call: ({ tool, input }, work) => {
    if (tool === "Read") return { name: "Read", input: { file_path: join(work, String(input["path"])) } };
    if (tool === "Skill") return { name: "Skill", input: { skill: String(input["name"]) } };
    return { name: tool, input };
  },
  segment: segmentClaudeCode,
};
