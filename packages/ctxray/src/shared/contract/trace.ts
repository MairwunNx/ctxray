import { z } from "zod";

export const TRACE_SCHEMA_VERSION = 1;

// The wire protocols harnesses speak to their model provider (ADR 0004).
export const Protocol = z.enum(["anthropic", "responses", "chat", "gemini"]);
export type Protocol = z.infer<typeof Protocol>;

const Json = z.record(z.string(), z.unknown());
export type Json = z.infer<typeof Json>;

// One request a harness sent, one line of a trace. `position` counts the model turns before it: a harness that
// retries a turn sends the same position again. Side calls without tools, like titles, have none.
export const Exchange = z.object({
  seq: z.number().int().nonnegative(),
  session: z.string(),
  protocol: Protocol,
  path: z.string().describe("The route after the session prefix, like `/v1/messages`"),
  position: z.number().int().nonnegative().optional(),
  retries: z.number().int().nonnegative(),
  userAgent: z.string().optional(),
  headers: z.record(z.string(), z.string()).describe("Redacted before the trace is written"),
  body: Json,
});
export type Exchange = z.infer<typeof Exchange>;

// What the mock model says on one turn. A harness sees it in its own protocol.
export type ToolCall = {
  name: string;
  input: unknown;
  namespace?: string; // Responses: MCP tools live in `mcp__<server>` namespaces
  freeform?: boolean; // Responses: a custom tool whose input is plain text, like Codex's code-mode `exec`
};
export type Step = { text: string } | { call: ToolCall } | { item: Json }; // a raw Responses output item, such as a `tool_search_call`
