import { expect, test } from "bun:test";
import type { Policy } from "#shared/contract/index.ts";
import type { CapturedLoadout } from "./captured.ts";
import { overBudget } from "./context.ts";

const loadout = {
  tokens: { total: 12_000, byComponent: { system: 5_000, tools: 4_000 } },
} as unknown as CapturedLoadout;

test("policy limits apply to what the harness really sent, by severity and harness", () => {
  const policies: Policy[] = [
    { id: "total", maxTokens: { total: 10_000 } },
    { id: "system", severity: "warning", maxTokens: { system: 4_000, tools: 8_000 } },
    { id: "other", harnesses: ["codex"], maxTokens: { total: 1 } },
  ];
  expect(overBudget(loadout, policies, "claude-code")).toEqual({
    errors: [{ key: "policy.overBudget", params: { component: "total", tokens: 12_000, limit: 10_000 } }],
    warnings: [{ key: "policy.overBudget", params: { component: "system", tokens: 5_000, limit: 4_000 } }],
  });
});
