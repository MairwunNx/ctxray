import type { Exchange, ToolCall } from "#shared/contract/index.ts";
import type { Inventory } from "../inventory.ts";
import type { RunDirs } from "./isolate.ts";

// Everything a capture adapter needs to start its harness against ctxray.
export type LaunchContext = {
  dirs: RunDirs;
  cwd: string; // relative to the project root
  prompt: string;
  model: string;
  baseUrl: string; // the proxy session
  env: Record<string, string>; // isolation: PATH, HOME, TMPDIR, the egress guard
  // The command line that runs an MCP server behind ctxray's shim, which logs it as `name`.
  shim: (name: string, command: readonly string[]) => Promise<string[]>;
};

export type Launch = { command: string[]; env: Record<string, string> };

// The model's side of a turn, as a test names it: `Read` a file, or any tool by the harness's own name.
export type Intent = { tool: string; input: Record<string, unknown> };

// One chunk of a request ctxray could tie to a source: a file by its path, or a piece of the harness.
export type Segment = {
  component: "system" | "rules" | "skills" | "mcp" | "commands" | "tools" | "messages";
  id: string; // `system:<title>`, a rule's path, a skill's name, `<server>/<tool>`, a tool's name
  text: string;
  evidence?: "marker" | "fingerprint" | "canary";
  deferred?: boolean; // an MCP tool listed by name only, its schema held back until the model asks
  source?: string; // the file the harness itself names for it, like a skill's SKILL.md
};

export type CaptureAdapter = {
  binary: string; // the executable on PATH
  defaultModel: string; // pinned: the model changes the payload (ADR 0013)
  version: (binary: string, env: Record<string, string>) => Promise<string>;
  launch: (binary: string, context: LaunchContext, inventory: Inventory) => Promise<Launch>;
  call: (intent: Intent, work: string, request: Exchange) => ToolCall;
  segment: (request: Exchange, work: string) => Segment[];
};
