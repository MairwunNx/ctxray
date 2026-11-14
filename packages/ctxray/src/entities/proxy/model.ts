// The wire protocols harnesses speak to their model provider (ADR 0004).
export type Protocol = "anthropic" | "responses" | "chat" | "gemini";

export type Json = Record<string, unknown>;

// What the mock model says on one turn. A harness sees it in its own protocol.
export type ToolCall = {
  name: string;
  input: unknown;
  namespace?: string; // Responses: MCP tools live in `mcp__<server>` namespaces
  freeform?: boolean; // Responses: a custom tool whose input is plain text, like Codex's code-mode `exec`
};
export type Step = { text: string } | { call: ToolCall } | { item: Json }; // a raw Responses output item, such as a `tool_search_call`

// One request a harness sent, as ctxray received it. `position` counts the model turns before it: a harness
// that retries a turn sends the same position again. Side calls without tools, like titles, have none.
export type Exchange = {
  seq: number;
  session: string;
  protocol: Protocol;
  path: string;
  position: number | undefined;
  retries: number;
  userAgent: string | undefined;
  headers: Record<string, string>;
  body: Json;
};

// What a request asks for. Only turns carry a conversation: the rest are counts, listings, and analytics.
export type Route = "turn" | "count" | "models" | "analytics" | "unknown";

// A request on its way through the proxy, before anyone answered it.
export type Incoming = {
  session: string;
  protocol: Protocol;
  route: Route;
  stream: boolean;
  path: string; // after the session prefix, like `/v1/messages`
  search: string;
  method: string;
  headers: Headers;
  body: Json;
  model: string | undefined; // Gemini names it in the path
};

export type Handler = (incoming: Incoming) => Promise<Response>;
