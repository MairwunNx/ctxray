import { type Egress, type Env, fetchThrough } from "#shared/infra/index.ts";
import { credentialsFor } from "./credentials.ts";
import { PROVIDERS } from "./forward.ts";
import type { Json, Protocol } from "./model.ts";

// The wire a model speaks, by its name: Claude, Gemini, or OpenAI's Responses for the rest.
export const protocolOfModel = (model: string): Protocol => {
  const name = model.split("/").at(-1) ?? model;
  if (name.startsWith("claude")) return "anthropic";
  if (name.startsWith("gemini") || name.startsWith("gemma")) return "gemini";
  return "responses";
};

const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const texts = (parts: Json[]) =>
  parts
    .map((part) => part["text"])
    .filter((text): text is string => typeof text === "string")
    .join("");

const CALLS: Record<
  "anthropic" | "responses" | "gemini",
  { path: (model: string) => string; body: (model: string, prompt: string) => Json; read: (answer: Json) => string }
> = {
  anthropic: {
    path: () => "/v1/messages",
    body: (model, prompt) => ({ model, max_tokens: 16_000, messages: [{ role: "user", content: prompt }] }),
    read: (answer) => texts(list(answer["content"]).filter((block) => block["type"] === "text")),
  },
  responses: {
    path: () => "/v1/responses",
    body: (model, prompt) => ({ model, input: prompt }),
    read: (answer) => texts(list(answer["output"]).flatMap((item) => list(item["content"]))),
  },
  gemini: {
    path: (model) => `/v1beta/models/${model}:generateContent`,
    body: (_, prompt) => ({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    read: (answer) => texts(list((list(answer["candidates"])[0]?.["content"] as Json | undefined)?.["parts"])),
  },
};

export type AskDeps = { upstream: string | undefined; egress: Egress; env: Env };

// One question to a model, through the user's upstream and network, the answer as text.
export const askModel = async ({ upstream, egress, env }: AskDeps, model: string, prompt: string): Promise<string> => {
  const protocol = protocolOfModel(model);
  const call = CALLS[protocol === "chat" ? "responses" : protocol];
  const base = (upstream ?? PROVIDERS[protocol]).replace(/\/$/, "");
  const response = await fetchThrough(
    new URL(`${base}${call.path(model)}`),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(protocol === "anthropic" && { "anthropic-version": "2023-06-01" }),
        ...credentialsFor(protocol, env),
      },
      body: JSON.stringify(call.body(model, prompt)),
    },
    egress,
  );
  const answer = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    const message = (answer["error"] as Json | undefined)?.["message"];
    throw new Error(`${response.status} ${typeof message === "string" ? message : response.statusText}`);
  }
  return call.read(answer);
};
