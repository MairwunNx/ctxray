import { describe, expect, test } from "bun:test";
import { jsonSchemas } from "./json-schema.ts";
import { LoadoutSnapshot } from "./loadout.ts";

const snapshot = () => ({
  schemaVersion: 1,
  harness: { name: "claude-code", version: "2.1.325", model: "claude-sonnet-5-5" },
  mode: "capture",
  system: [{ id: "base", title: "Base prompt", tokens: 9870 }],
  rules: [{ path: "rules/payments.mdc", activation: "path", reason: "glob:**/payments/**/*.kt", tokens: 410 }],
  skills: { listed: [{ name: "refunds", path: ".claude/skills/refunds/SKILL.md", tokens: 38 }], loaded: [] },
  mcp: {
    servers: [{ name: "jira", version: "2.4.0" }],
    tools: [{ server: "jira", name: "create_issue", tokens: 640 }],
  },
  commands: [{ name: "release", path: ".claude/commands/release.md" }],
  tokens: {
    total: 10958,
    byComponent: { system: 9870, rules: 410, skills: 38, mcp: 640 },
    byMcpServer: { jira: 640 },
    exact: false,
    method: "local:o200k_base",
  },
  provenance: { "rule:rules/payments.mdc": { source: "rules/payments.mdc", reason: "glob", evidence: "canary" } },
});

type Snapshot = ReturnType<typeof snapshot>;

describe("LoadoutSnapshot", () => {
  test("accepts a complete snapshot", () => {
    expect(LoadoutSnapshot.safeParse(snapshot()).success).toBe(true);
  });

  test.each<[string, (s: Snapshot) => unknown]>([
    ["a future schema version", (s) => ({ ...s, schemaVersion: 2 })],
    ["an unknown harness", (s) => ({ ...s, harness: { ...s.harness, name: "copilot" } })],
    ["an unknown capture mode", (s) => ({ ...s, mode: "replay" })],
    ["an unknown activation", (s) => ({ ...s, rules: s.rules.map((r) => ({ ...r, activation: "sometimes" })) })],
    ["negative tokens", (s) => ({ ...s, system: s.system.map((x) => ({ ...x, tokens: -1 })) })],
    ["fractional tokens", (s) => ({ ...s, tokens: { ...s.tokens, total: 10.5 } })],
    ["an unknown component", (s) => ({ ...s, tokens: { ...s.tokens, byComponent: { messages: 1 } } })],
    ["a missing exact flag", (s) => ({ ...s, tokens: { ...s.tokens, exact: undefined } })],
    [
      "an unknown provenance evidence",
      (s) => ({ ...s, provenance: { x: { source: "a", reason: "b", evidence: "guess" } } }),
    ],
  ])("rejects %s", (_, mutate) => {
    expect(LoadoutSnapshot.safeParse(mutate(snapshot())).success).toBe(false);
  });
});

describe("jsonSchemas", () => {
  const schemas = jsonSchemas();

  test.each(Object.keys(schemas))("%s carries a draft 2020-12 header and a release $id", (name) => {
    const schema = schemas[name as keyof typeof schemas];
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(`https://github.com/MairwunNx/ctxray/releases/latest/download/${name}.schema.json`);
  });

  test("the loadout schema pins the version and lists every activation", () => {
    const text = JSON.stringify(schemas.loadout);
    expect(text).toContain('"schemaVersion":{"type":"number","const":1}');
    expect(text).toContain('"enum":["always","path","intent","manual"]');
  });
});
