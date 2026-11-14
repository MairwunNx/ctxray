import type { Exchange, Json, Protocol, Step, ToolCall } from "#shared/contract/index.ts";

export type { Exchange, Json, Protocol, Step, ToolCall };

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
