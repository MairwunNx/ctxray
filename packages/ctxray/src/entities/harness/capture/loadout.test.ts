import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Exchange, HarnessId } from "#shared/contract/index.ts";
import type { ServerRecord } from "#shared/mcp-shim/index.ts";
import { CAPTURE_ADAPTERS, STATIC_ADAPTERS } from "../adapters.ts";
import { openProject } from "../project.ts";
import { buildLoadout } from "./loadout.ts";

// Contract tests: requests the real harnesses sent for the capture fixture, recorded by
// scripts/record-payloads.ts. A harness upgrade that moves its markers fails here first.
const PAYLOADS = join(import.meta.dir, "../../../../fixtures/payloads");
const project = await openProject(join(import.meta.dir, "../../../../fixtures/capture/payments"));

const loadoutOf = async (harness: HarnessId, index: number, files: string[] = []) => {
  const record = (await Bun.file(join(PAYLOADS, `${harness}.json`)).json()) as {
    version: string;
    model: string;
    servers: Record<string, ServerRecord>;
  };
  const request = (await Bun.file(join(PAYLOADS, `${harness}-${index}.json`)).json()) as Exchange;
  const statics = STATIC_ADAPTERS[harness];
  const capture = CAPTURE_ADAPTERS[harness];
  if (!statics || !capture) throw new Error(harness);
  const inventory = await statics.discover(project);
  return buildLoadout({
    harness: { name: harness, version: record.version, model: record.model },
    segments: capture.segment(request, "<work>"),
    inventory,
    predicted: statics.resolve(inventory, { cwd: "app", files }),
    servers: record.servers,
    work: "<work>",
    first: index === 0,
  });
};

const READ = ["app/src/main/kotlin/payments/Charge.kt"];

describe.each<[HarnessId, string[], string[], string[]]>([
  [
    "claude-code",
    ["CLAUDE.md", ".claude/rules/style.md", "app/CLAUDE.md", "app/AGENTS.md"],
    ["payouts", "refunds"],
    [
      "app/src/main/kotlin/payments/CLAUDE.md",
      "app/src/main/kotlin/payments/AGENTS.md",
      ".claude/rules/kotlin.md",
      ".claude/rules/payments.md",
    ],
  ],
  ["codex", ["AGENTS.md", "app/AGENTS.md"], ["android-build", "refunds"], []],
])("%s", (harness, rules, skills, later) => {
  test("the first request: rules, project skills, MCP servers, tokens", async () => {
    const loadout = await loadoutOf(harness, 0);
    expect(loadout.rules.map((rule) => rule.path)).toEqual(rules);
    expect(loadout.rules.every((rule) => rule.activation === "always" && rule.tokens > 0)).toBe(true);
    const own = loadout.skills.listed.filter((skill) => !skill.builtin);
    expect(own.map((skill) => skill.name).sort()).toEqual(skills);
    expect(loadout.skills.listed.some((skill) => skill.builtin)).toBe(true);
    expect(loadout.mcp.servers).toEqual([
      { name: "github", version: "1.0.0" },
      { name: "jira", version: "1.0.0" },
    ]);
    expect(loadout.mcp.tools.map((tool) => [tool.name, tool.deferred])).toEqual([
      ["create_issue", true],
      ["list_pulls", true],
      ["search_issues", true],
    ]);
    expect(loadout.tokens.byMcpServer["jira"]).toBeGreaterThan(30);
    expect(loadout.tokens.total).toBeGreaterThan(5_000);
    expect(loadout.tokens.total).toBeLessThan(25_000);
    expect(loadout.system.length).toBeGreaterThan(3);
  });

  test("a file read adds what the harness loads for it", async () => {
    const loadout = await loadoutOf(harness, 1, READ);
    expect(loadout.rules.map((rule) => rule.path)).toEqual([...rules, ...later]);
    for (const path of later) {
      expect(loadout.rules.find((rule) => rule.path === path)?.activation).toBe("path");
    }
  });
});

test("Claude Code lists project commands with the skills, and ctxray tells them apart", async () => {
  const loadout = await loadoutOf("claude-code", 0);
  expect(loadout.commands).toEqual([{ name: "changelog", path: ".claude/commands/changelog.md" }]);
});

test("Codex ties each AGENTS.md chunk to its file by canary", async () => {
  const loadout = await loadoutOf("codex", 0);
  expect(Object.values(loadout.provenance).map((entry) => entry.evidence)).toEqual(["canary", "canary"]);
});
