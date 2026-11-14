import { join } from "node:path";
import type { Exchange, Json, ToolCall } from "#shared/contract/index.ts";
import type { CaptureAdapter } from "../capture/model.ts";
import { codexVersion, launchCodex } from "./launch.ts";
import { segmentCodex } from "./segment.ts";

const quoted = (path: string) => `'${path.replaceAll("'", `'\\''`)}'`;

// Classic models get `exec_command`, code-mode models only a freeform `exec` that runs JavaScript (ADR 0006).
const hasCodeMode = (request: Exchange) => {
  const items = Array.isArray(request.body["input"]) ? (request.body["input"] as Json[]) : [];
  return !Array.isArray(request.body["tools"]) && items.some((item) => item["type"] === "additional_tools");
};

const shell = (cmd: string, request: Exchange): ToolCall =>
  hasCodeMode(request)
    ? { name: "exec", freeform: true, input: `text(await tools.exec_command(${JSON.stringify({ cmd })}))` }
    : { name: "exec_command", input: { cmd } };

// Codex at capture tier. It has no Read tool: reading a file is `cat` through its shell tool.
export const CODEX_CAPTURE: CaptureAdapter = {
  binary: "codex",
  defaultModel: "gpt-5.5",
  version: codexVersion,
  launch: launchCodex,
  call: ({ tool, input }, work, request) => {
    if (tool === "Read") return shell(`cat ${quoted(join(work, String(input["path"])))}`, request);
    const mcp = /^mcp__(.+?)__(.+)$/.exec(tool);
    if (mcp) return { name: mcp[2] as string, namespace: `mcp__${mcp[1]}`, input };
    return { name: tool, input };
  },
  segment: segmentCodex,
};
