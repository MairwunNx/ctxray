import type { Exchange, Json } from "#shared/contract/index.ts";
import { exchange, jsonLines, type Recorded, record, text } from "../recorded.ts";

// What the model sends back. Each run of them answers one request.
const OUTPUTS = ["function_call", "custom_tool_call", "local_shell_call", "reasoning", "tool_search_call"];
const isOutput = (item: Json) =>
  OUTPUTS.includes(String(item["type"])) || (item["type"] === "message" && item["role"] === "assistant");

// The rollout's own bookkeeping, which the wire never carries.
const asSent = (item: Json): Json => {
  const { id: _, status: __, internal_chat_message_metadata_passthrough: ___, ...rest } = item;
  return rest;
};

// A Codex session rebuilt from its rollout, `CODEX_HOME/sessions/…/rollout-*.jsonl` (ADR 0006): the base prompt
// from `session_meta`, then every input item as sent. The rollout keeps no tool schemas.
export const readRollout = (content: string, session: string): Recorded => {
  const lines = jsonLines(content);
  const meta = record(lines.find((line) => line["type"] === "session_meta")?.["payload"]);
  const turn = record(lines.findLast((line) => line["type"] === "turn_context")?.["payload"]);
  const usage = record(record(lines.findLast((line) => line["type"] === "token_usage_record")?.["payload"])["usage"]);
  const base = text(record(meta["base_instructions"])["text"]);
  const items = lines.filter((line) => line["type"] === "response_item").map((line) => asSent(record(line["payload"])));
  const input: Json[] = base
    ? [{ type: "message", role: "developer", content: [{ type: "input_text", text: base }] }]
    : [];
  const requests: Exchange[] = [];
  items.forEach((item, index) => {
    const previous = items[index - 1];
    if (isOutput(item) && (!previous || !isOutput(previous)))
      requests.push(
        exchange(session, "responses", "/v1/responses", requests.length, { model: turn["model"], input: [...input] }),
      );
    input.push(item);
  });
  return {
    requests,
    version: text(meta["cli_version"]),
    cwd: text(turn["cwd"]) ?? text(meta["cwd"]),
    model: text(turn["model"]),
    files: [],
    reported: typeof usage["input_tokens"] === "number" ? usage["input_tokens"] : undefined,
    unseen: ["tools"],
  };
};
