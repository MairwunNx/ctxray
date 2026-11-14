import { CAPTURE_ADAPTERS, type Finding, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Component, HarnessId, Policy } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { toFailure } from "./attempt.ts";
import type { Capture } from "./capture.ts";
import type { CapturedLoadout } from "./captured.ts";
import type { CellResult } from "./run.ts";
import type { Workspace } from "./scope.ts";
import type { Selection } from "./selection.ts";
import { createSession } from "./session.ts";

const base = (harness: HarnessId): CellResult => ({
  file: undefined,
  check: "context",
  suites: [],
  fixture: undefined,
  name: "",
  key: "context",
  layer: "L4",
  harness,
  status: "passed",
  attempts: 1,
  duration: 0,
});

const tokensOf = (loadout: CapturedLoadout, component: string) =>
  component === "total" ? loadout.tokens.total : (loadout.tokens.byComponent[component as Component] ?? 0);

// The token limits of the policies on what the harness really sent: system prompt, tools, and MCP included,
// which L2 can't see.
export const overBudget = (loadout: CapturedLoadout, policies: readonly Policy[], harness: HarnessId) => {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  for (const policy of policies.filter((one) => !one.harnesses || one.harnesses.includes(harness))) {
    for (const [component, limit] of Object.entries(policy.maxTokens ?? {})) {
      const tokens = tokensOf(loadout, component);
      if (limit === undefined || tokens <= limit) continue;
      (policy.severity === "warning" ? warnings : errors).push({
        key: "policy.overBudget",
        params: { component, tokens, limit },
      });
    }
  }
  return { errors, warnings };
};

const checkOne = async (
  workspace: Workspace,
  harness: HarnessId,
  capture: Capture,
  policies: readonly Policy[],
  env: Env,
): Promise<CellResult> => {
  const adapter = CAPTURE_ADAPTERS[harness];
  if (!adapter || !Bun.which(adapter.binary, { PATH: env["PATH"] ?? "" })) {
    return {
      ...base(harness),
      status: "skipped",
      reason: "unavailable",
      missing: [adapter?.binary ?? harness],
      attempts: 0,
    };
  }
  const started = performance.now();
  const scope = { harness, workspace, inventory: await workspace.inventoryOf(harness), snapshot: () => {} };
  const session = createSession(capture, scope);
  try {
    const { loadout } = await session.firstRequest();
    await session.end();
    const { errors, warnings } = overBudget(loadout, policies, harness);
    const found = [...errors, ...warnings];
    return {
      ...base(harness),
      status: errors.length > 0 ? "failed" : "passed",
      tokens: loadout.tokens.total,
      duration: performance.now() - started,
      ...(found.length > 0 && { failure: { kind: "findings" as const, findings: found } }),
      ...(warnings.length > 0 && { warnings: warnings.length }),
    };
  } catch (error) {
    await session.end().catch(() => {});
    return { ...base(harness), status: "failed", failure: toFailure(error), duration: performance.now() - started };
  }
};

// L4 without a single test: how much context each harness starts the project with, against the policies.
export const runContextChecks = async (
  workspace: Workspace,
  selection: Selection,
  capture: Capture,
  policies: readonly Policy[],
  env: Env,
): Promise<CellResult[]> => {
  if (!selection.layers.has("L4") || selection.backend.kind !== "mock") return [];
  const results: CellResult[] = [];
  for (const harness of selection.harnesses.filter((id) => STATIC_ADAPTERS[id] && CAPTURE_ADAPTERS[id])) {
    results.push(await checkOne(workspace, harness, capture, policies, env));
  }
  return results;
};
