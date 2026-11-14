import type { Json, Step } from "../model.ts";
import type { Kit } from "./kit.ts";
import { roughTokens, sseResponse } from "./sse.ts";

const contentsOf = (body: Json) => (Array.isArray(body["contents"]) ? (body["contents"] as Json[]) : []);

const partOf = (step: Step) =>
  "call" in step
    ? { functionCall: { name: step.call.name, args: step.call.input } }
    : { text: "text" in step ? step.text : "" };

// Gemini streams plain `data:` events with no closing sentinel. A function call is one part, and the CLI
// assigns call ids itself (ADR 0004).
export const gemini: Kit = {
  position: (body) => contentsOf(body).filter((content) => content["role"] === "model").length,
  hasTools: (body) => Array.isArray(body["tools"]) && body["tools"].length > 0,
  reply: (step, body, stream) => {
    const reply = {
      candidates: [{ content: { role: "model", parts: [partOf(step)] }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: roughTokens(body), candidatesTokenCount: roughTokens(step) },
    };
    return stream ? sseResponse([{ data: reply }]) : Response.json(reply);
  },
  error: (status, message) =>
    Response.json({ error: { code: status, message, status: status === 404 ? "NOT_FOUND" : "INTERNAL" } }, { status }),
};
