import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exactSummary } from "./attribute.ts";
import { memoryCountCache, openCountCache } from "./cache.ts";
import { createExactCounter } from "./counter.ts";

// A provider that counts a token per four characters of what it got, and remembers who asked.
const asked: { path: string; key: string | null }[] = [];
const provider = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const text = await request.text();
    asked.push({ path: new URL(request.url).pathname, key: request.headers.get("x-api-key") });
    const tokens = Math.ceil(text.length / 4);
    return request.url.includes("countTokens")
      ? Response.json({ totalTokens: tokens })
      : Response.json({ input_tokens: tokens });
  },
});
const dirs: string[] = [];
afterAll(async () => {
  provider.stop(true);
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const NO_EGRESS = { proxy: undefined, noProxy: [], ca: [] };
const BODY = {
  model: "claude-sonnet-5-5",
  stream: true,
  max_tokens: 32000,
  system: [{ type: "text", text: "You are Claude Code.\n\nContents of CLAUDE.md:\nUse Kotlin." }],
  tools: [
    { name: "Read", description: "Read a file.", input_schema: { type: "object" } },
    { name: "mcp__jira__search", description: "Search Jira issues.", input_schema: { type: "object" } },
  ],
  messages: [{ role: "user", content: "Refund order 123." }],
};
const PIECES = [
  { component: "system", id: "system:intro", text: "You are Claude Code." },
  { component: "rules", id: "CLAUDE.md", text: "Contents of CLAUDE.md:\nUse Kotlin." },
];
const LOCAL = { byComponent: { system: 5, rules: 8, tools: 10, mcp: 10 }, byMcpServer: { jira: 10 } };

describe("exact counts", () => {
  test("the rows add up to the provider's total, and the key goes out in place of none", async () => {
    asked.length = 0;
    const counter = createExactCounter({
      upstream: provider.url.origin,
      egress: NO_EGRESS,
      env: { ANTHROPIC_API_KEY: "real" },
      cache: memoryCountCache(),
    });
    const summary = await exactSummary(counter, "anthropic", "claude-sonnet-5-5", BODY, PIECES, LOCAL);
    if (!summary) throw new Error("no summary");
    const rows = Object.entries(summary.byComponent)
      .filter(([component]) => component !== "mcp")
      .reduce((sum, [, tokens]) => sum + tokens, summary.byComponent["mcp"] ?? 0);
    expect(rows + summary.framing).toBe(summary.total);
    expect(summary.byMcpServer["jira"]).toBe(summary.byComponent["mcp"]);
    expect(summary.method).toBe("provider:anthropic.count_tokens");
    expect(new Set(asked.map((one) => `${one.path} ${one.key}`))).toEqual(new Set(["/v1/messages/count_tokens real"]));
  });

  test("a second run asks nothing, and an old count asks again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctxray-counts-"));
    dirs.push(dir);
    let now = 0;
    const cache = openCountCache(join(dir, "tokens.db"), () => now);
    const counter = createExactCounter({ upstream: provider.url.origin, egress: NO_EGRESS, env: {}, cache });
    asked.length = 0;
    await counter.count("gemini", "gemini-2.5-flash", { contents: [] });
    await counter.count("gemini", "gemini-2.5-flash", { contents: [] });
    now = 31 * 24 * 60 * 60 * 1000;
    await counter.count("gemini", "gemini-2.5-flash", { contents: [] });
    expect(asked.map((one) => one.path)).toEqual([
      "/v1beta/models/gemini-2.5-flash:countTokens",
      "/v1beta/models/gemini-2.5-flash:countTokens",
    ]);
    cache.close();
  });

  test("Chat Completions has nothing to count with", async () => {
    const counter = createExactCounter({
      upstream: provider.url.origin,
      egress: NO_EGRESS,
      env: {},
      cache: memoryCountCache(),
    });
    expect(await exactSummary(counter, "chat", "gpt-5.5", {}, [], LOCAL)).toBeUndefined();
  });
});
