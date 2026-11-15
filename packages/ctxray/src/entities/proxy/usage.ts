import type { Protocol } from "./model.ts";

// What one model answer cost, in the provider's own count: uncached input, cache reads and writes, output.
export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export const NO_USAGE: Usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
});

// Every JSON object of a response: the whole body, or each `data:` line of a stream.
const objectsOf = (text: string): unknown[] => {
  const parse = (part: string) => {
    try {
      return [JSON.parse(part)];
    } catch {
      return [];
    }
  };
  const whole = parse(text);
  if (whole.length > 0) return whole;
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .flatMap((line) => parse(line.slice(5).trim()));
};

// The largest value each field takes anywhere in the answer: streams repeat running totals.
const largest = (objects: readonly unknown[]) => {
  const found = new Map<string, number>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) for (const item of value) walk(item);
    else if (typeof value === "object" && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        if (typeof inner === "number") found.set(key, Math.max(found.get(key) ?? 0, inner));
        else walk(inner);
      }
    }
  };
  walk(objects);
  return (key: string) => found.get(key) ?? 0;
};

// Anthropic counts cached input apart from `input_tokens`. OpenAI and Gemini count it within the input.
export const usageOf = (protocol: Protocol, text: string): Usage => {
  const field = largest(objectsOf(text));
  if (protocol === "anthropic") {
    return {
      input: field("input_tokens"),
      cacheRead: field("cache_read_input_tokens"),
      cacheWrite: field("cache_creation_input_tokens"),
      output: field("output_tokens"),
    };
  }
  if (protocol === "gemini") {
    const cached = field("cachedContentTokenCount");
    return {
      input: Math.max(0, field("promptTokenCount") - cached),
      cacheRead: cached,
      cacheWrite: 0,
      output: field("candidatesTokenCount") + field("thoughtsTokenCount"),
    };
  }
  const cached = field("cached_tokens");
  const input = protocol === "chat" ? field("prompt_tokens") : field("input_tokens");
  const output = protocol === "chat" ? field("completion_tokens") : field("output_tokens");
  return { input: Math.max(0, input - cached), cacheRead: cached, cacheWrite: 0, output };
};
