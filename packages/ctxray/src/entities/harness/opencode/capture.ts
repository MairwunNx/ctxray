import { join } from "node:path";
import type { CaptureAdapter } from "../capture/model.ts";
import { launchOpencode, opencodeVersion } from "./launch.ts";
import { segmentOpencode } from "./segment.ts";

// OpenCode at capture tier (ADR 0008). Reading a file is `read`, a skill loads through `skill`.
export const OPENCODE_CAPTURE: CaptureAdapter = {
  binary: "opencode",
  defaultModel: "claude-sonnet-5-5",
  version: opencodeVersion,
  launch: launchOpencode,
  call: ({ tool, input }, work) => {
    if (tool === "Read") return { name: "read", input: { filePath: join(work, String(input["path"])) } };
    if (tool === "Skill") return { name: "skill", input: { name: String(input["name"]) } };
    return { name: tool, input };
  },
  segment: segmentOpencode,
};
