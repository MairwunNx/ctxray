import { describe, expect, test } from "bun:test";
import type { Protocol } from "./model.ts";
import { costOf, priceOf } from "./prices.ts";
import { type Usage, usageOf } from "./usage.ts";

const sse = (...events: object[]) => events.map((data) => `event: x\ndata: ${JSON.stringify(data)}\n\n`).join("");

describe("usageOf", () => {
  test.each<[string, Protocol, string, Usage]>([
    [
      "an Anthropic stream",
      "anthropic",
      sse(
        {
          type: "message_start",
          message: { usage: { input_tokens: 12, cache_read_input_tokens: 900, output_tokens: 1 } },
        },
        { type: "message_delta", usage: { output_tokens: 57 } },
      ),
      { input: 12, cacheRead: 900, cacheWrite: 0, output: 57 },
    ],
    [
      "an Anthropic answer",
      "anthropic",
      JSON.stringify({ usage: { input_tokens: 30, cache_creation_input_tokens: 2000, output_tokens: 8 } }),
      { input: 30, cacheRead: 0, cacheWrite: 2000, output: 8 },
    ],
    [
      "a Responses stream",
      "responses",
      sse(
        { type: "response.created", response: { usage: null } },
        {
          type: "response.completed",
          response: { usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 40 } },
        },
      ),
      { input: 200, cacheRead: 800, cacheWrite: 0, output: 40 },
    ],
    [
      "a Chat Completions stream",
      "chat",
      `${sse({ choices: [] }, { usage: { prompt_tokens: 500, completion_tokens: 20 } })}data: [DONE]\n\n`,
      { input: 500, cacheRead: 0, cacheWrite: 0, output: 20 },
    ],
    [
      "a Gemini stream with running totals",
      "gemini",
      sse(
        { usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 3 } },
        { usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 9, thoughtsTokenCount: 30 } },
      ),
      { input: 700, cacheRead: 0, cacheWrite: 0, output: 39 },
    ],
    ["an error", "anthropic", "upstream exploded", { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }],
  ])("%s", (_, protocol, text, expected) => {
    expect(usageOf(protocol, text)).toEqual(expected);
  });
});

describe("costOf", () => {
  test.each<[string, string, Usage, number | undefined]>([
    ["Sonnet 5.5", "claude-sonnet-5-5", { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 100_000 }, 3],
    ["a cache read", "claude-sonnet-5-5", { input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0 }, 0.2],
    ["a provider prefix", "anthropic/claude-opus-5-5", { input: 0, cacheRead: 0, cacheWrite: 0, output: 50_000 }, 1],
    ["a model nobody priced", "local-llama", { input: 10, cacheRead: 0, cacheWrite: 0, output: 10 }, undefined],
  ])("%s", (_, model, usage, expected) => {
    const cost = costOf(usage, priceOf(model));
    expect(cost === undefined ? undefined : Math.round(cost * 1e6) / 1e6).toEqual(expected);
  });

  test("the config prices a model of its own", () => {
    expect(priceOf("local-llama", { "local-llama": { input: 1, output: 1 } })).toEqual({ input: 1, output: 1 });
  });
});
