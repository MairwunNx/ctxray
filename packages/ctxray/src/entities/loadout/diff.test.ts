import { expect, test } from "bun:test";
import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import { diffLoadouts } from "./diff.ts";

const loadout = (version: string, parts: Partial<LoadoutSnapshot>): LoadoutSnapshot => ({
  schemaVersion: 1,
  harness: { name: "codex", version },
  mode: "capture",
  system: [],
  rules: [],
  skills: { listed: [], loaded: [] },
  mcp: { servers: [], tools: [] },
  commands: [],
  tokens: { total: 0, byComponent: {}, byMcpServer: {}, exact: false, method: "local:o200k" },
  provenance: {},
  ...parts,
});

test("what came, what went, and what changed size", () => {
  const before = loadout("0.168.0", {
    system: [
      { id: "system:base", title: "Base prompt", tokens: 4000 },
      { id: "system:old", title: "Old section", tokens: 80 },
    ],
    rules: [{ path: "AGENTS.md", activation: "always", reason: "cwd:", tokens: 300 }],
    tokens: { total: 4380, byComponent: { system: 4080, rules: 300 }, byMcpServer: {}, exact: false, method: "local" },
  });
  const after = loadout("0.169.0", {
    system: [
      { id: "system:base", title: "Base prompt", tokens: 4100 },
      { id: "system:skills", title: "Skills instructions", tokens: 120 },
    ],
    rules: [{ path: "AGENTS.md", activation: "always", reason: "cwd:", tokens: 300 }],
    tokens: { total: 4520, byComponent: { system: 4220, rules: 300 }, byMcpServer: {}, exact: false, method: "local" },
  });
  const diff = diffLoadouts(before, after);
  expect(diff.total).toEqual({ before: 4380, after: 4520 });
  expect(diff.byComponent).toEqual({ system: { before: 4080, after: 4220 }, rules: { before: 300, after: 300 } });
  expect(diff.changes).toEqual([
    { component: "system", id: "Base prompt", before: 4000, after: 4100 },
    { component: "system", id: "Old section", before: 80, after: undefined },
    { component: "system", id: "Skills instructions", before: undefined, after: 120 },
  ]);
});

test("the same loadout has no changes", () => {
  const same = loadout("1", { rules: [{ path: "CLAUDE.md", activation: "always", reason: "", tokens: 10 }] });
  expect(diffLoadouts(same, same).changes).toEqual([]);
});
