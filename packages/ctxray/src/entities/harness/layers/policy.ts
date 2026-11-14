import type { Component, Policy } from "#shared/contract/index.ts";
import { isGlob } from "#shared/glob/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import { inParallel } from "#shared/infra/index.ts";
import type { Project } from "../project.ts";
import type { StaticLoadout } from "../static-loadout.ts";

export type Finding = { key: MessageKey; params: Readonly<Record<string, string | number>> };

export type PolicyOutcome = {
  id: string;
  severity: "error" | "warning";
  status: "passed" | "failed" | "skipped";
  failures: Finding[];
  // Checks a static view can't answer, like the size of MCP tool schemas: L4 checks them on a real run.
  skipped: Finding[];
};

const STATIC_COMPONENTS: readonly (Component | "total")[] = ["rules", "skills", "commands"];

const tokenChecks = (limits: Policy["maxTokens"], loadout: StaticLoadout) => {
  const failures: Finding[] = [];
  const skipped: Finding[] = [];
  let checked = 0;
  for (const [component, limit] of Object.entries(limits ?? {})) {
    if (limit === undefined) continue;
    if (!STATIC_COMPONENTS.includes(component as Component)) {
      skipped.push({ key: "policy.needsCapture", params: { component } });
      continue;
    }
    checked++;
    const tokens = loadout.tokens.byComponent[component as Component] ?? 0;
    if (tokens > limit) failures.push({ key: "policy.overBudget", params: { component, tokens, limit } });
  }
  return { failures, skipped, checked };
};

const missingFiles = async (project: Project, required: readonly string[]): Promise<Finding[]> => {
  const found = await inParallel(required, async (path) =>
    isGlob(path) ? project.files.some((file) => new Bun.Glob(path).match(file)) : project.exists(path),
  );
  return required
    .filter((_, index) => !found[index])
    .map((path): Finding => ({ key: "policy.missingFile", params: { path } }));
};

const checkPolicy = async (policy: Policy, project: Project, loadout: StaticLoadout): Promise<PolicyOutcome> => {
  const servers = new Set(loadout.mcp.servers.map((server) => server.name));
  const tokens = tokenChecks(policy.maxTokens, loadout);
  const failures = [
    ...[...new Set(policy.denyMcp).intersection(servers)].map(
      (name): Finding => ({ key: "policy.deniedMcp", params: { name } }),
    ),
    ...[...new Set(policy.requireMcp).difference(servers)].map(
      (name): Finding => ({ key: "policy.missingMcp", params: { name } }),
    ),
    ...(await missingFiles(project, policy.requireFiles ?? [])),
    ...tokens.failures,
  ];
  const ran = tokens.checked > 0 || [policy.denyMcp, policy.requireMcp, policy.requireFiles].some(Boolean);
  const status = failures.length > 0 ? "failed" : ran ? "passed" : "skipped";
  return { id: policy.id, severity: policy.severity ?? "error", status, failures, skipped: tokens.skipped };
};

// L2: the configuration follows the organisation's rules. A policy names the harnesses it covers.
export const checkPolicies = (
  policies: readonly Policy[],
  project: Project,
  loadout: StaticLoadout,
): Promise<PolicyOutcome[]> =>
  inParallel(
    policies.filter((policy) => !policy.harnesses || policy.harnesses.includes(loadout.harness)),
    (policy) => checkPolicy(policy, project, loadout),
  );
