import type { Json, Step } from "../model.ts";
import type { Kit } from "./kit.ts";
import { chunks, type Event, newId, roughTokens, sseResponse } from "./sse.ts";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

const blocksOf = (step: Step): Block[] => {
  if ("text" in step) return [{ type: "text", text: step.text }];
  if ("call" in step) return [{ type: "tool_use", id: newId("toolu"), name: step.call.name, input: step.call.input }];
  return [{ type: "text", text: "" }];
};

const messageOf = (body: Json, content: Block[]) => ({
  id: newId("msg"),
  type: "message",
  role: "assistant",
  model: body["model"],
  content,
  stop_reason: content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn",
  stop_sequence: null,
  usage: { input_tokens: roughTokens(body), output_tokens: roughTokens(content) },
});

// The public grammar, all of it: Claude Code repeats a turn without streaming when message_start is missing.
const streamOf = (message: ReturnType<typeof messageOf>): Event[] => {
  const event = (type: string, data: Json): Event => ({ event: type, data: { type, ...data } });
  const events = [
    event("message_start", { message: { ...message, content: [], stop_reason: null } }),
    event("ping", {}),
  ];
  for (const [index, block] of message.content.entries()) {
    if (block.type === "text") {
      events.push(event("content_block_start", { index, content_block: { type: "text", text: "" } }));
      for (const text of chunks(block.text, 64)) {
        events.push(event("content_block_delta", { index, delta: { type: "text_delta", text } }));
      }
    } else {
      events.push(event("content_block_start", { index, content_block: { ...block, input: {} } }));
      const json = JSON.stringify(block.input);
      events.push(event("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: json } }));
    }
    events.push(event("content_block_stop", { index }));
  }
  events.push(
    event("message_delta", {
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: { output_tokens: message.usage.output_tokens },
    }),
    event("message_stop", {}),
  );
  return events;
};

const messagesOf = (body: Json) => (Array.isArray(body["messages"]) ? (body["messages"] as Json[]) : []);

export const anthropic: Kit = {
  position: (body) => messagesOf(body).filter((message) => message["role"] === "assistant").length,
  hasTools: (body) => Array.isArray(body["tools"]) && body["tools"].length > 0,
  reply: (step, body) => {
    const message = messageOf(body, blocksOf(step));
    const headers = { "request-id": newId("req") };
    return body["stream"] === true ? sseResponse(streamOf(message), headers) : Response.json(message, { headers });
  },
  error: (status, message) =>
    Response.json(
      { type: "error", error: { type: status === 404 ? "not_found_error" : "api_error", message } },
      { status },
    ),
};
