import { describe, expect, test } from "bun:test";
import { UserConfig } from "./config.ts";
import { jsonSchemas } from "./json-schema.ts";

// The example from the manual, with every field set.
const full = {
  $schema: "https://github.com/MairwunNx/ctxray/releases/latest/download/config.schema.json",
  extends: ["@rwb/ctxray-config"],
  harnesses: { "claude-code": { version: "2.x" }, codex: {}, opencode: { provider: "anthropic" }, "cursor-cli": false },
  backends: { pr: "replay", nightly: "real" },
  upstream: "https://llm-gateway.corp.test",
  offline: false,
  network: { proxy: "http://proxy:3128", noProxy: [".corp.test"], ca: ["certs/corp.pem"], systemCa: true },
  policies: [
    { id: "mcp-budget", maxTokens: { mcp: 10_000 } },
    { id: "forbidden-mcp", denyMcp: ["some-server"] },
    { id: "require-agents-md", requireFiles: ["AGENTS.md"], severity: "warning" },
  ],
  redact: { patterns: [/INTERNAL-\d+/, "CORP-[0-9]{6}"] },
  reporters: ["console", "html", "junit", "allure", "json", "markdown"],
  lang: "auto",
  report: { langs: ["en", "ru"] },
};

const keyOf = (input: unknown) => {
  const result = UserConfig.safeParse(input);
  if (result.success) return "ok";
  const issue = result.error.issues[0];
  return issue?.code === "custom" ? String(issue.params?.["key"]) : issue?.code;
};

describe("UserConfig", () => {
  test("accepts a config with every field", () => {
    expect(keyOf(full)).toBe("ok");
  });

  test("turns string patterns into RegExp", () => {
    const parsed = UserConfig.parse({ redact: { patterns: ["CORP-\\d+"] } });
    expect(parsed.redact?.patterns?.[0]).toEqual(/CORP-\d+/);
  });

  test.each<[string, unknown, string | undefined]>([
    ["an empty config", {}, "ok"],
    ["extends as one string", { extends: "./base.jsonc" }, "ok"],
    ["a typo in a key", { harness: {} }, "unrecognized_keys"],
    ["an unknown harness", { harnesses: { copilot: {} } }, "unrecognized_keys"],
    ["a typo in harness settings", { harnesses: { codex: { verison: "1" } } }, "unrecognized_keys"],
    ["an unknown backend", { backends: { pr: "live" } }, "invalid_value"],
    ["an unknown reporter", { reporters: ["xml"] }, "invalid_value"],
    ["a broken pattern", { redact: { patterns: ["(unclosed"] } }, "config.badPattern"],
    ["a policy that only adjusts an inherited one", { policies: [{ id: "a", severity: "warning" }] }, "ok"],
    ["a policy without an id", { policies: [{ denyMcp: ["x"] }] }, "invalid_type"],
    ["a negative token limit", { policies: [{ id: "a", maxTokens: { total: -1 } }] }, "too_small"],
    ["an unknown component limit", { policies: [{ id: "a", maxTokens: { mcpTools: 1 } }] }, "unrecognized_keys"],
    [
      "two policies with one id",
      {
        policies: [
          { id: "a", denyMcp: ["x"] },
          { id: "a", requireMcp: ["y"] },
        ],
      },
      "config.duplicatePolicy",
    ],
  ])("%s", (_, input, expected) => {
    expect(keyOf(input)).toBe(expected);
  });
});

describe("config JSON Schema", () => {
  const schema = JSON.stringify(jsonSchemas().config);

  test("describes the input: patterns are strings, harnesses can be false", () => {
    expect(schema).toContain('"anyOf":[{"type":"string"},{"not":{}}]');
    expect(schema).toContain('"const":false');
  });

  test("rejects unknown keys, so editors flag typos", () => {
    expect(schema).toContain('"additionalProperties":false');
  });
});
