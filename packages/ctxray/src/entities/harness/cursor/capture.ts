import { join } from "node:path";
import type { CaptureAdapter } from "../capture/model.ts";
import { cursorCliVersion, launchCursorCli } from "./launch.ts";
import { segmentCursorCli } from "./segment.ts";

// Cursor CLI at experimental capture tier, through its local build (ADR 0009). `Read` takes an absolute path.
export const CURSOR_CLI_CAPTURE: CaptureAdapter = {
  binary: "cursor-agent-local",
  defaultModel: "claude-sonnet-5-5",
  // A DNS prewarm and telemetry to Cursor, and npm: the local build carries on when the guard refuses them.
  probes: ["api2.cursor.sh:443", "registry.npmjs.org:443"],
  version: cursorCliVersion,
  launch: launchCursorCli,
  call: ({ tool, input }, work) => {
    if (tool === "Read") return { name: "Read", input: { path: join(work, String(input["path"])) } };
    return { name: tool, input };
  },
  segment: segmentCursorCli,
};
