import type { ShimLine } from "./shim.ts";

export type McpToolSchema = { name: string; description?: string; inputSchema?: unknown };

// What one MCP server told the harness, read back from its shim log.
export type ServerRecord = {
  info: { name: string; version: string } | undefined;
  instructions: string | undefined;
  tools: McpToolSchema[];
  calls: { name: string; arguments: unknown }[];
};

type Message = { id?: number | string; method?: string; params?: Record<string, unknown>; result?: unknown };

export const readShimLog = (text: string): ServerRecord => {
  const record: ServerRecord = { info: undefined, instructions: undefined, tools: [], calls: [] };
  const asked = new Map<string, string>(); // request id → method
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const { from, message } = JSON.parse(raw) as ShimLine;
    const { id, method, params, result } = message as Message;
    if (from === "client" && method !== undefined) {
      if (id !== undefined) asked.set(String(id), method);
      if (method === "tools/call")
        record.calls.push({ name: String(params?.["name"]), arguments: params?.["arguments"] });
      continue;
    }
    if (from !== "server" || id === undefined || typeof result !== "object" || result === null) continue;
    const answer = result as Record<string, unknown>;
    const question = asked.get(String(id));
    if (question === "initialize") {
      record.info = answer["serverInfo"] as ServerRecord["info"];
      record.instructions = typeof answer["instructions"] === "string" ? answer["instructions"] : undefined;
    } else if (question === "tools/list" && Array.isArray(answer["tools"])) {
      // A harness may page through the list or ask again: keep each tool once.
      for (const tool of answer["tools"] as McpToolSchema[]) {
        if (!record.tools.some((known) => known.name === tool.name)) record.tools.push(tool);
      }
    }
  }
  return record;
};
