import { describe, expect, test } from "bun:test";
import type { UserConfig } from "#shared/contract/index.ts";
import { deepMerge, mergeConfigs } from "./merge.ts";

describe("deepMerge", () => {
  test.each<[string, unknown, unknown, unknown]>([
    ["override wins for scalars", 1, 2, 2],
    ["undefined keeps the base", 1, undefined, 1],
    ["objects merge key by key", { a: 1, b: 2 }, { b: 3, c: 4 }, { a: 1, b: 3, c: 4 }],
    ["nested objects merge", { a: { x: 1, y: 2 } }, { a: { y: 3 } }, { a: { x: 1, y: 3 } }],
    ["arrays replace", { a: [1, 2] }, { a: [3] }, { a: [3] }],
    ["an object replaces a scalar", { a: false }, { a: { x: 1 } }, { a: { x: 1 } }],
    ["a scalar replaces an object", { a: { x: 1 } }, { a: false }, { a: false }],
    ["a RegExp is a value, not an object", { a: /x/ }, { a: /y/ }, { a: /y/ }],
  ])("%s", (_, base, override, expected) => {
    expect(deepMerge(base, override)).toEqual(expected);
  });

  test("leaves its inputs alone", () => {
    const base = { a: { x: 1 } };
    deepMerge(base, { a: { x: 2 } });
    expect(base).toEqual({ a: { x: 1 } });
  });
});

describe("mergeConfigs", () => {
  const org: UserConfig = {
    harnesses: { "claude-code": { version: "2.x" }, codex: {}, "cursor-cli": {} },
    upstream: "https://gw.corp.test",
    reporters: ["junit"],
    network: { proxy: "http://proxy.corp.test:3128", ca: ["/org/ca.pem"] },
    policies: [
      { id: "mcp-budget", maxTokens: { mcp: 10_000 } },
      { id: "forbidden-mcp", denyMcp: ["some-server"] },
    ],
    redact: { patterns: [/ORG-\d+/] },
    lint: {
      rules: { "broken-link": "error", size: "warning" },
      ignore: ["vendor/**"],
      overrides: [{ include: ["legacy/**"], rules: { "broken-link": "off" } }],
    },
  };

  test.each<[string, UserConfig, Partial<UserConfig>]>([
    ["an empty project keeps everything", {}, org],
    ["scalars from the project win", { upstream: "https://gw.local" }, { upstream: "https://gw.local" }],
    ["arrays from the project replace", { reporters: ["html"] }, { reporters: ["html"] }],
    [
      "harness settings merge per field",
      { harnesses: { "claude-code": { model: "opus" } } },
      { harnesses: { "claude-code": { version: "2.x", model: "opus" }, codex: {}, "cursor-cli": {} } },
    ],
    [
      "false drops an inherited harness",
      { harnesses: { "cursor-cli": false } },
      { harnesses: { "claude-code": { version: "2.x" }, codex: {}, "cursor-cli": false } },
    ],
    [
      "network merges per field",
      { network: { noProxy: [".corp.test"] } },
      { network: { proxy: "http://proxy.corp.test:3128", ca: ["/org/ca.pem"], noProxy: [".corp.test"] } },
    ],
    [
      "a policy with an inherited id merges into it, in place",
      { policies: [{ id: "mcp-budget", maxTokens: { total: 25_000 } }] },
      {
        policies: [
          { id: "mcp-budget", maxTokens: { mcp: 10_000, total: 25_000 } },
          { id: "forbidden-mcp", denyMcp: ["some-server"] },
        ],
      },
    ],
    [
      "lint rules merge per check, ignores and overrides add up",
      {
        lint: {
          rules: { size: "error" },
          ignore: ["generated/**"],
          overrides: [{ include: ["docs/**"], rules: { "dead-rule": "off" } }],
        },
      },
      {
        lint: {
          rules: { "broken-link": "error", size: "error" },
          ignore: ["vendor/**", "generated/**"],
          overrides: [
            { include: ["legacy/**"], rules: { "broken-link": "off" } },
            { include: ["docs/**"], rules: { "dead-rule": "off" } },
          ],
        },
      },
    ],
    [
      "a new policy goes to the end",
      { policies: [{ id: "require-agents-md", requireFiles: ["AGENTS.md"] }] },
      {
        policies: [
          { id: "mcp-budget", maxTokens: { mcp: 10_000 } },
          { id: "forbidden-mcp", denyMcp: ["some-server"] },
          { id: "require-agents-md", requireFiles: ["AGENTS.md"] },
        ],
      },
    ],
    [
      "redact patterns add up and never drop",
      { redact: { patterns: [/ORG-\d+/, /TEAM-\d+/] } },
      { redact: { patterns: [/ORG-\d+/, /TEAM-\d+/] } },
    ],
    ["an empty patterns list keeps the inherited ones", { redact: { patterns: [] } }, { redact: org.redact }],
  ])("%s", (_, project, expected) => {
    expect(mergeConfigs(org, project)).toMatchObject(expected);
  });

  test("extends never survives a merge", () => {
    expect(mergeConfigs({}, { extends: ["@rwb/ctxray-config"], lang: "ru" })).toEqual({ lang: "ru" });
  });

  test("a project policy can weaken an inherited one to a warning", () => {
    const merged = mergeConfigs(org, { policies: [{ id: "forbidden-mcp", severity: "warning", denyMcp: [] }] });
    expect(merged.policies?.[1]).toEqual({ id: "forbidden-mcp", severity: "warning", denyMcp: [] });
  });
});
