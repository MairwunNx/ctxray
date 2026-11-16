import { TOOLS } from "./tools.ts";

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
export type CallResult = { text: string; isError: boolean };
export type Server = {
  version: string;
  call: (name: string, input: Record<string, unknown>) => Promise<CallResult | undefined>;
};

// The protocol version a client asks for, or this one when it names none.
const LATEST = "2025-11-25";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const error = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// The answer to one JSON-RPC message of an MCP client over stdio, or nothing for a notification.
export const respond = async (message: Message, server: Server) => {
  if (message.id === undefined || message.id === null) return undefined;
  const { id } = message;
  const params = record(message.params);
  const result = (value: unknown) => ({ jsonrpc: "2.0", id, result: value });
  switch (message.method) {
    case "initialize":
      return result({
        protocolVersion: typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ctxray", version: server.version },
      });
    case "ping":
      return result({});
    case "tools/list":
      return result({ tools: TOOLS });
    case "tools/call": {
      const called = await server.call(String(params["name"]), record(params["arguments"]));
      if (!called) return error(id, -32602, `Unknown tool or missing arguments: ${String(params["name"])}`);
      return result({ content: [{ type: "text", text: called.text }], isError: called.isError });
    }
    default:
      return error(id, -32601, `Method not found: ${String(message.method)}`);
  }
};
