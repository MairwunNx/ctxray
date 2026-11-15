import { expect, test } from "bun:test";
import { credentialsFor } from "./credentials.ts";
import type { Protocol } from "./model.ts";

test.each<[Protocol, Record<string, string>, Record<string, string>]>([
  ["anthropic", { ANTHROPIC_API_KEY: "a" }, { "x-api-key": "a" }],
  ["responses", { OPENAI_API_KEY: "o" }, { authorization: "Bearer o" }],
  ["chat", { OPENAI_API_KEY: "o" }, { authorization: "Bearer o" }],
  ["gemini", { GEMINI_API_KEY: "g" }, { "x-goog-api-key": "g" }],
  ["anthropic", { ANTHROPIC_API_KEY: "a", CTXRAY_UPSTREAM_KEY: "gw" }, { "x-api-key": "gw" }],
  ["responses", {}, {}],
  [
    "anthropic",
    { CLAUDE_CODE_OAUTH_TOKEN: "t" },
    { authorization: "Bearer t", "anthropic-beta": "a,oauth-2025-04-20" },
  ],
  ["anthropic", { CLAUDE_CODE_OAUTH_TOKEN: "t", ANTHROPIC_API_KEY: "a" }, { "x-api-key": "a" }],
  ["responses", { CLAUDE_CODE_OAUTH_TOKEN: "t" }, {}],
])("%s with %p", (protocol, env, expected) => {
  expect(credentialsFor(protocol, env, "a")).toEqual(expected);
});
