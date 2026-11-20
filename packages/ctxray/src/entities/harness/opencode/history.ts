import type { Exchange, Json } from "#shared/contract/index.ts";
import { exchange, type Recorded, record, text } from "../recorded.ts";

// Rows of `opencode.db` for one session, oldest first: each message and part keeps its JSON in `data`.
export type HistoryRows = {
  session: { directory: string; version: string; model: string | null };
  messages: { id: string; data: string }[];
  parts: { message_id: string; data: string }[];
};

const parse = (data: string): Json => {
  try {
    return record(JSON.parse(data));
  } catch {
    return {};
  }
};

const tokensOf = (finish: Json | undefined) => {
  const tokens = record(finish?.["tokens"]);
  const cache = record(tokens["cache"]);
  const sum = [tokens["input"], cache["read"], cache["write"]].filter((value) => typeof value === "number");
  return sum.length === 0 ? undefined : (sum as number[]).reduce((total, value) => total + value, 0);
};

// An OpenCode session rebuilt from its database (ADR 0008) as Chat Completions messages: what the person typed,
// and per model step its text and tool calls with their results. Tool results hold the AGENTS.md files a read
// brought in and the skills the model loaded. The system message, with the instruction files at start and the
// skill listing, and the tools never reach the database.
export const readHistory = (rows: HistoryRows, session: string): Recorded => {
  const partsOf = new Map<string, Json[]>();
  for (const part of rows.parts)
    partsOf.set(part.message_id, [...(partsOf.get(part.message_id) ?? []), parse(part.data)]);
  const messages: Json[] = [];
  const requests: Exchange[] = [];
  const files: string[] = [];
  let seen: string[] = [];
  let finish: Json | undefined;
  for (const message of rows.messages) {
    const parts = partsOf.get(message.id) ?? [];
    if (parse(message.data)["role"] === "user") {
      const typed = parts.flatMap((part) => (part["type"] === "text" ? [String(part["text"])] : []));
      messages.push({ role: "user", content: typed.join("\n") });
      continue;
    }
    let said: string[] = [];
    let calls: Json[] = [];
    const flush = () => {
      if (said.length === 0 && calls.length === 0) return;
      const toolCalls = calls.map((call) => ({
        id: call["callID"],
        type: "function",
        function: { name: call["tool"] },
      }));
      messages.push({
        role: "assistant",
        content: said.join("\n"),
        ...(calls.length > 0 && { tool_calls: toolCalls }),
      });
      for (const call of calls)
        messages.push({
          role: "tool",
          tool_call_id: call["callID"],
          content: String(record(call["state"])["output"] ?? ""),
        });
      said = [];
      calls = [];
    };
    for (const part of parts) {
      if (part["type"] === "step-start") {
        flush();
        requests.push(exchange(session, "chat", "/v1/chat/completions", requests.length, { messages: [...messages] }));
        seen = [...new Set(files)];
      }
      if (part["type"] === "step-finish") finish = part;
      if (part["type"] === "text") said.push(String(part["text"]));
      if (part["type"] !== "tool") continue;
      calls.push(part);
      const path = text(record(record(part["state"])["input"])["filePath"]);
      if (path) files.push(path);
    }
    flush();
  }
  const model = text(parse(rows.session.model ?? "")["id"]);
  return {
    requests,
    version: text(rows.session.version),
    cwd: text(rows.session.directory),
    model,
    files: seen,
    reported: tokensOf(finish),
    unseen: ["system", "rules", "skills", "tools"],
  };
};
