import type { Exchange, Json } from "#shared/contract/index.ts";

type Entry = Json & { type?: string };

const record = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};

const entriesOf = (transcript: string): Entry[] =>
  transcript.split("\n").flatMap((line) => {
    try {
      return line.trim() === "" ? [] : [record(JSON.parse(line))];
    } catch {
      return [];
    }
  });

// The model's answers, one message each: the transcript keeps a block per entry, under the message's id.
const answersOf = (entries: readonly Entry[]): Json[] => {
  const byId = new Map<string, unknown[]>();
  for (const entry of entries.filter((one) => one.type === "assistant")) {
    const message = record(entry["message"]);
    const id = String(message["id"] ?? entry["uuid"]);
    byId.set(id, [...(byId.get(id) ?? []), ...(Array.isArray(message["content"]) ? message["content"] : [])]);
  }
  return [...byId.values()].map((content) => ({ role: "assistant", content }));
};

export type Transcript = { requests: Exchange[]; version: string | undefined; cwd: string | undefined };

// The requests Claude Code sent in a session, rebuilt from its transcript (2.1.3xx). An `api-request-shape` holds
// the system prompt and tools, an `api-request-blob` one message, and each `api-request` keeps the first `keep`
// messages of the request before it and adds `tail`. The model's answers have no blob: they come, in order, from
// the transcript's own entries, each tied to its hash the first time it appears. An older transcript without these entries gives none.
export const readTranscript = (transcript: string, session: string): Transcript => {
  const entries = entriesOf(transcript);
  const shapes = new Map<string, Json>();
  const blobs = new Map<string, Json>();
  for (const entry of entries) {
    if (entry.type === "api-request-shape") shapes.set(String(entry["shapeHash"]), record(entry["shape"]));
    if (entry.type === "api-request-blob") blobs.set(String(entry["hash"]), record(entry["message"]));
  }
  const answers = answersOf(entries);
  const requests: Exchange[] = [];
  let messages: Json[] = [];
  for (const entry of entries.filter((one) => one.type === "api-request")) {
    const shape = shapes.get(String(entry["shapeHash"]));
    if (!shape) continue;
    const keep = typeof entry["keep"] === "number" ? entry["keep"] : 0;
    const tail = Array.isArray(entry["tail"]) ? entry["tail"].map(String) : [];
    // A resumed session lists its whole history again: an answer seen before keeps its place.
    const added = tail.flatMap((hash) => {
      if (!blobs.has(hash) && answers.length > 0) blobs.set(hash, answers.shift() as Json);
      const message = blobs.get(hash);
      return message ? [message] : [];
    });
    messages = [...messages.slice(0, keep), ...added];
    requests.push({
      seq: requests.length,
      session,
      protocol: "anthropic",
      path: "/v1/messages",
      retries: 0,
      headers: {},
      body: { ...record(entry["params"]), system: shape["system"], tools: shape["tools"], messages },
    });
  }
  const text = (key: string) => {
    const value = entries.find((entry) => typeof entry[key] === "string")?.[key];
    return typeof value === "string" ? value : undefined;
  };
  return { requests, version: text("version"), cwd: text("cwd") };
};

// The files the agent read, wrote, or edited by the time of a request: what L3 resolves rules for.
export const filesOfRequest = (request: Exchange): string[] => {
  const messages = Array.isArray(request.body["messages"]) ? request.body["messages"] : [];
  const files = messages.flatMap((message) => {
    const content = record(message)["content"];
    return (Array.isArray(content) ? content : []).flatMap((block) => {
      const path = record(record(block)["input"])["file_path"];
      return record(block)["type"] === "tool_use" && typeof path === "string" ? [path] : [];
    });
  });
  return [...new Set(files)];
};
