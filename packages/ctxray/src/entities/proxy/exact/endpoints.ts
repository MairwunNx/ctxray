import type { Json, Protocol } from "../model.ts";

// A provider's count-tokens endpoint (ADR 0012). Each returns one total, for a body in its own protocol.
export type Endpoint = {
  method: string; // as `tokens.method` names it
  path: (model: string) => string;
  request: (body: Json, model: string) => Json; // what the endpoint accepts of a request
  read: (answer: Json) => number | undefined;
  headers?: Record<string, string>;
  minimal: (model: string) => Json; // a one-word conversation: the baseline every count subtracts
  withSystem: (body: Json, text: string) => Json;
  withTools: (body: Json, tools: readonly Json[]) => Json;
  toolsOf: (body: Json) => Json[];
  probe: Json; // one small tool: Anthropic adds its tool-use preamble with the first tool
};

const pick = (body: Json, fields: readonly string[]) =>
  Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const number = (value: unknown) => (typeof value === "number" ? value : undefined);
const EMPTY_SCHEMA = { type: "object", properties: {} };

const anthropic: Endpoint = {
  method: "provider:anthropic.count_tokens",
  path: () => "/v1/messages/count_tokens",
  request: (body, model) => ({ ...pick(body, ["system", "messages", "tools", "tool_choice", "thinking"]), model }),
  read: (answer) => number(answer["input_tokens"]),
  headers: { "anthropic-version": "2023-06-01" },
  minimal: (model) => ({ model, messages: [{ role: "user", content: "hi" }] }),
  withSystem: (body, text) => ({ ...body, system: text }),
  withTools: (body, tools) => ({ ...body, tools: [...list(body["tools"]), ...tools] }),
  toolsOf: (body) => list(body["tools"]),
  probe: { name: "ctxray_probe", description: "Probe.", input_schema: EMPTY_SCHEMA },
};

const responses: Endpoint = {
  method: "provider:openai.input_tokens",
  path: () => "/v1/responses/input_tokens",
  request: (body, model) => ({
    ...pick(body, ["instructions", "input", "tools", "tool_choice", "reasoning", "text", "truncation"]),
    model,
  }),
  read: (answer) => number(answer["input_tokens"]),
  minimal: (model) => ({ model, input: "hi" }),
  withSystem: (body, text) => ({ ...body, instructions: text }),
  withTools: (body, tools) => ({ ...body, tools: [...list(body["tools"]), ...tools] }),
  toolsOf: (body) => list(body["tools"]),
  probe: { type: "function", name: "ctxray_probe", description: "Probe.", parameters: EMPTY_SCHEMA },
};

// Gemini nests every declaration in tool groups: ctxray flattens them and puts its picks in one group.
const declarations = (body: Json) => list(body["tools"]).flatMap((group) => list(group["functionDeclarations"]));

const gemini: Endpoint = {
  method: "provider:gemini.countTokens",
  path: (model) => `/v1beta/models/${model}:countTokens`,
  request: (body, model) => ({
    generateContentRequest: { model: `models/${model}`, ...pick(body, ["contents", "systemInstruction", "tools"]) },
  }),
  read: (answer) => number(answer["totalTokens"]),
  minimal: () => ({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
  withSystem: (body, text) => ({ ...body, systemInstruction: { parts: [{ text }] } }),
  withTools: (body, tools) => ({ ...body, tools: [{ functionDeclarations: [...declarations(body), ...tools] }] }),
  toolsOf: declarations,
  probe: { name: "ctxray_probe", description: "Probe.", parameters: { type: "OBJECT", properties: {} } },
};

// Chat Completions has no count endpoint.
export const ENDPOINTS: Partial<Record<Protocol, Endpoint>> = { anthropic, responses, gemini };
