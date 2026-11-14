import { describe, expect, test } from "bun:test";
import type { HarnessId, Policy } from "#shared/contract/index.ts";
import { resolveIn } from "../static.fixture.ts";
import { checkPolicies, type PolicyOutcome } from "./policy.ts";

const run = async (policies: Policy[], harness: HarnessId = "claude-code") => {
  const { project, loadout, inventory } = await resolveIn("payments", harness);
  return checkPolicies(policies, project, loadout, inventory);
};

type Summary = { status: PolicyOutcome["status"]; failures: string[]; skipped: string[] };

const summary = (outcome: PolicyOutcome): Summary => ({
  status: outcome.status,
  failures: outcome.failures.map((finding) => finding.key),
  skipped: outcome.skipped.map((finding) => finding.key),
});

describe("L2 policies on the payments fixture", () => {
  test.each<[string, Policy, Summary]>([
    ["a denied server is there", { id: "p", denyMcp: ["jira", "slack"] }, fail(["policy.deniedMcp"])],
    ["a disabled server doesn't count", { id: "p", denyMcp: ["legacy"] }, pass()],
    ["a required server is missing", { id: "p", requireMcp: ["github", "sentry"] }, fail(["policy.missingMcp"])],
    ["required files exist", { id: "p", requireFiles: ["AGENTS.md", "app/**/*.kt"] }, pass()],
    [
      "a required file is missing",
      { id: "p", requireFiles: ["SECURITY.md", "web/**"] },
      fail(["policy.missingFile", "policy.missingFile"]),
    ],
    ["rules fit the budget", { id: "p", maxTokens: { rules: 10_000 } }, pass()],
    ["rules exceed the budget", { id: "p", maxTokens: { rules: 10, skills: 10_000 } }, fail(["policy.overBudget"])],
    ["every file fits its limit", { id: "p", maxTokensEach: { rule: 500, skill: 500, command: 500 } }, pass()],
    ["one skill over its own limit", { id: "p", maxTokensEach: { skill: 8 } }, fail(["policy.itemOverBudget"])],
    [
      "MCP and total limits need a real run",
      { id: "p", maxTokens: { mcp: 10_000, total: 25_000 } },
      { status: "skipped", failures: [], skipped: ["policy.needsCapture", "policy.needsCapture"] },
    ],
    [
      "a static check passes while a capture-only one waits",
      { id: "p", maxTokens: { skills: 10_000, mcp: 10_000 } },
      { status: "passed", failures: [], skipped: ["policy.needsCapture"] },
    ],
  ])("%s", async (_, policy, expected) => {
    const [outcome] = await run([policy]);
    expect(outcome && summary(outcome)).toEqual(expected);
  });

  test("a policy for other harnesses doesn't apply", async () => {
    expect(await run([{ id: "codex-only", harnesses: ["codex"], denyMcp: ["jira"] }])).toEqual([]);
  });

  test("severity defaults to error and a warning stays a warning", async () => {
    const outcomes = await run([
      { id: "strict", denyMcp: ["jira"] },
      { id: "soft", severity: "warning", denyMcp: ["jira"] },
    ]);
    expect(outcomes.map(({ id, severity }) => `${id} ${severity}`)).toEqual(["strict error", "soft warning"]);
  });

  test("the over-budget finding names the numbers", async () => {
    const [outcome] = await run([{ id: "p", maxTokens: { commands: 1 } }], "claude-code");
    expect(outcome?.failures[0]?.params).toMatchObject({ component: "commands", limit: 1 });
  });
});

function pass(): Summary {
  return { status: "passed", failures: [], skipped: [] };
}

function fail(failures: string[]): Summary {
  return { status: "failed", failures, skipped: [] };
}
