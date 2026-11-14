import type { Json, Step } from "../model.ts";
import type { Kit } from "./kit.ts";
import { newId, roughTokens, sseResponse } from "./sse.ts";

const itemOf = (step: Step): Json => {
  const id = newId("item");
  const callId = newId("call");
  if ("item" in step) return { id, call_id: callId, status: "completed", ...step.item };
  if ("text" in step) {
    return {
      id,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: step.text, annotations: [] }],
    };
  }
  const { name, input, namespace, freeform } = step.call;
  const common = { id, call_id: callId, status: "completed", name, ...(namespace && { namespace }) };
  return freeform
    ? { ...common, type: "custom_tool_call", input: String(input) }
    : { ...common, type: "function_call", arguments: JSON.stringify(input) };
};

const inputOf = (body: Json) => (Array.isArray(body["input"]) ? (body["input"] as Json[]) : []);

// Codex needs only output_item.done with the whole item and response.completed (ADR 0004).
export const responses: Kit = {
  position: (body) => inputOf(body).filter((item) => String(item["type"] ?? "").endsWith("_output")).length,
  hasTools: (body) =>
    (Array.isArray(body["tools"]) && body["tools"].length > 0) ||
    inputOf(body).some((item) => item["type"] === "additional_tools"),
  reply: (step, body) => {
    const item = itemOf(step);
    const usage = {
      input_tokens: roughTokens(body),
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: roughTokens(item),
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: roughTokens(body) + roughTokens(item),
    };
    const response = { id: newId("resp"), object: "response", created_at: 0, model: body["model"], usage };
    if (body["stream"] !== true) return Response.json({ ...response, status: "completed", output: [item] });
    const events: { event: string; data: Json }[] = [
      { event: "response.created", data: { response: { ...response, status: "in_progress", output: [] } } },
      { event: "response.output_item.added", data: { output_index: 0, item: { ...item, status: "in_progress" } } },
      { event: "response.output_item.done", data: { output_index: 0, item } },
      { event: "response.completed", data: { response: { ...response, status: "completed", output: [item] } } },
    ];
    return sseResponse(
      events.map(({ event, data }, index) => ({
        event,
        data: { type: event, sequence_number: index, ...data },
      })),
    );
  },
  error: (status, message) => Response.json({ error: { message, type: "server_error" } }, { status }),
};
