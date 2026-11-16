import { describe, expect, test } from "bun:test";
import { respond, type Server } from "./protocol.ts";
import { argsOf } from "./tools.ts";

const server: Server = {
  version: "0.1.0",
  call: async (name, input) =>
    name === "inspect" ? { text: `inspected ${JSON.stringify(input)}`, isError: false } : undefined,
};

describe("respond", () => {
  test.each<[string, object, unknown]>([
    [
      "initialize echoes the client's protocol",
      { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ctxray", version: "0.1.0" },
      },
    ],
    ["ping", { id: 2, method: "ping" }, {}],
    [
      "a tool call",
      { id: 3, method: "tools/call", params: { name: "inspect", arguments: { cwd: "app" } } },
      { content: [{ type: "text", text: 'inspected {"cwd":"app"}' }], isError: false },
    ],
  ])("%s", async (_, message, result) => {
    expect(await respond(message, server)).toEqual({ jsonrpc: "2.0", id: (message as { id: number }).id, result });
  });

  test("lists inspect, run, and diff", async () => {
    const answer = (await respond({ id: 4, method: "tools/list" }, server)) as {
      result: { tools: { name: string }[] };
    };
    expect(answer.result.tools.map(({ name }) => name)).toEqual(["inspect", "run", "diff"]);
  });

  test.each<[string, object, number]>([
    ["an unknown method", { id: 5, method: "resources/list" }, -32601],
    ["an unknown tool", { id: 6, method: "tools/call", params: { name: "rm" } }, -32602],
  ])("%s is an error", async (_, message, code) => {
    expect(((await respond(message, server)) as { error: { code: number } }).error.code).toBe(code);
  });

  test("a notification gets no answer", async () => {
    expect(await respond({ method: "notifications/initialized" }, server)).toBeUndefined();
  });
});

describe("argsOf", () => {
  test.each<[string, Record<string, unknown>, string | undefined, string[] | undefined]>([
    ["inspect", {}, "claude-code", ["inspect", "--harness", "claude-code"]],
    [
      "inspect",
      { cwd: "app", files: ["a.kt", "b.kt"], harness: "codex" },
      "claude-code",
      ["inspect", "--cwd", "app", "--files", "a.kt,b.kt", "--harness", "codex"],
    ],
    [
      "run",
      { layer: "L1,L2,L3", filter: "payments" },
      undefined,
      ["test", "--layer", "L1,L2,L3", "--filter", "payments"],
    ],
    ["diff", { base: "main" }, undefined, ["diff", "--base", "main"]],
    ["diff", {}, undefined, undefined],
    ["shell", {}, undefined, undefined],
  ])("%s %j", (name, input, harness, args) => {
    expect(argsOf(name, input, harness)).toEqual(args);
  });
});
