import { join } from "node:path";
import type { CaptureAdapter } from "../capture/model.ts";
import { geminiCliVersion, launchGeminiCli } from "./launch.ts";
import { segmentGeminiCli } from "./segment.ts";

// Gemini CLI at capture tier (ADR 0007). Reading a file is `read_file`, a skill loads through `activate_skill`.
export const GEMINI_CLI_CAPTURE: CaptureAdapter = {
  binary: "gemini",
  defaultModel: "gemini-2.5-flash",
  runtime: "node",
  version: geminiCliVersion,
  launch: launchGeminiCli,
  call: ({ tool, input }, work) => {
    if (tool === "Read") return { name: "read_file", input: { file_path: join(work, String(input["path"])) } };
    if (tool === "Skill") return { name: "activate_skill", input: { name: String(input["name"]) } };
    return { name: tool, input };
  },
  segment: segmentGeminiCli,
};
