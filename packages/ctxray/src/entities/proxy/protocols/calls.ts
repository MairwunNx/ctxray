import type { Json, Protocol } from "../model.ts";

// A tool call the model made earlier in the conversation, as the harness sends it back.
export type MadeCall = { name: string; input: unknown };

const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

const parsed = (text: unknown) => {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const named = (name: unknown, input: unknown): MadeCall[] => (typeof name === "string" ? [{ name, input }] : []);

const READERS: Record<Protocol, (body: Json) => MadeCall[]> = {
  anthropic: (body) =>
    list(body["messages"])
      .filter((message) => message["role"] === "assistant")
      .flatMap((message) => list(message["content"]))
      .filter((block) => block["type"] === "tool_use")
      .flatMap((block) => named(block["name"], block["input"])),
  responses: (body) =>
    list(body["input"]).flatMap((item) => {
      if (item["type"] === "function_call") return named(item["name"], parsed(item["arguments"]));
      if (item["type"] === "custom_tool_call") return named(item["name"], item["input"]);
      return [];
    }),
  chat: (body) =>
    list(body["messages"])
      .flatMap((message) => list(message["tool_calls"]))
      .flatMap((call) => {
        const fn = (call["function"] ?? {}) as Json;
        return named(fn["name"], parsed(fn["arguments"]));
      }),
  gemini: (body) =>
    list(body["contents"])
      .filter((content) => content["role"] === "model")
      .flatMap((content) => list(content["parts"]))
      .flatMap((part) => {
        const call = part["functionCall"] as Json | undefined;
        return call ? named(call["name"], call["args"]) : [];
      }),
};

// Every tool call in a request's history, oldest first: the agent's trajectory up to this turn.
export const callsOf = (protocol: Protocol, body: Json): MadeCall[] => READERS[protocol](body);
