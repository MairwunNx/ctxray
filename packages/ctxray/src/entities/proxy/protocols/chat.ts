import type { Json, Step } from "../model.ts";
import type { Kit } from "./kit.ts";
import { newId, roughTokens } from "./sse.ts";

const messagesOf = (body: Json) => (Array.isArray(body["messages"]) ? (body["messages"] as Json[]) : []);

const messageOf = (step: Step) =>
  "call" in step
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: newId("call"),
            type: "function",
            function: { name: step.call.name, arguments: JSON.stringify(step.call.input) },
          },
        ],
      }
    : { role: "assistant", content: "text" in step ? step.text : "" };

// Chat Completions, for OpenCode and other OpenAI-compatible clients: chunks, then `data: [DONE]`.
export const chat: Kit = {
  position: (body) => messagesOf(body).filter((message) => message["role"] === "assistant").length,
  hasTools: (body) => Array.isArray(body["tools"]) && body["tools"].length > 0,
  reply: (step, body) => {
    const message = messageOf(step);
    const finish = "call" in step ? "tool_calls" : "stop";
    const base = { id: newId("chatcmpl"), created: 0, model: body["model"] };
    const usage = { prompt_tokens: roughTokens(body), completion_tokens: roughTokens(message) };
    if (body["stream"] !== true) {
      return Response.json({
        ...base,
        object: "chat.completion",
        choices: [{ index: 0, message, finish_reason: finish }],
        usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
      });
    }
    const delta =
      "tool_calls" in message ? { ...message, tool_calls: [{ index: 0, ...message.tool_calls[0] }] } : message;
    const chunk = (choices: unknown[], extra: Json = {}) =>
      `data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices, ...extra })}\n\n`;
    const text =
      chunk([{ index: 0, delta, finish_reason: null }]) +
      chunk([{ index: 0, delta: {}, finish_reason: finish }]) +
      chunk([], { usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } }) +
      "data: [DONE]\n\n";
    return new Response(text, { headers: { "content-type": "text/event-stream" } });
  },
  error: (status, message) => Response.json({ error: { message, type: "server_error" } }, { status }),
};
