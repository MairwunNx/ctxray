import { z } from "zod";

export const HarnessId = z
  .enum(["claude-code", "claude-code-desktop", "codex", "cursor-cli", "cursor-ide", "gemini-cli", "opencode"])
  .describe("The harness a loadout belongs to");
export type HarnessId = z.infer<typeof HarnessId>;

// How a loadout was obtained. `static` predicts it from files, `capture` records the requests of a harness
// ctxray launched, `observe` records a session the user ran.
export const CaptureMode = z.enum(["static", "capture", "observe"]).describe("How ctxray obtained the loadout");
export type CaptureMode = z.infer<typeof CaptureMode>;

export const HarnessInfo = z.object({
  name: HarnessId,
  version: z.string().describe("Harness version, part of every snapshot key"),
  model: z.string().optional().describe("Model slug the harness was pinned to; it changes the payload too"),
});
export type HarnessInfo = z.infer<typeof HarnessInfo>;
