import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import { createInspectAction, type InspectRequest, type InspectResult } from "./inspect.action.ts";

// A copy in a repository of its own, so the copy is the project root and the user's tree stays untouched.
const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-inspect-")));
cpSync(join(import.meta.dir, "../../../fixtures/static/payments"), root, { recursive: true });
Bun.spawnSync(["git", "init", "-q"], { cwd: root });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const inspect = async (request: InspectRequest, harnesses: Partial<Record<HarnessId, object>> = {}, cwd = root) => {
  const result = await createInspectAction({ ...DEFAULT_CONFIG, harnesses }, cwd)(request);
  if ("missingFolder" in result) throw new Error(`missing ${result.missingFolder}`);
  return result;
};

const harness = (result: InspectResult, id: HarnessId) => {
  const found = result.harnesses.find((inspected) => inspected.harness === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

describe("which harnesses", () => {
  test.each<[string, InspectRequest, Partial<Record<HarnessId, object>>, HarnessId[], HarnessId[]]>([
    ["every readable one without a config", {}, {}, ["claude-code", "codex"], []],
    ["the configured ones", {}, { codex: {} }, ["codex"], []],
    ["the flag over the config", { harnesses: ["claude-code"] }, { codex: {} }, ["claude-code"], []],
    ["unreadable ones as unsupported", { harnesses: ["gemini-cli", "codex"] }, {}, ["codex"], ["gemini-cli"]],
  ])("%s", async (_, request, configured, shown, unsupported) => {
    const result = await inspect(request, configured);
    expect(result.harnesses.map((inspected) => inspected.harness)).toEqual(shown);
    expect(result.unsupported).toEqual(unsupported);
  });
});

describe("scope", () => {
  test("cwd and files are relative to where ctxray runs, and files outside the root drop out", async () => {
    const result = await inspect({ cwd: "app", files: ["app/src/main/kotlin/payments/Charge.kt", "../elsewhere.kt"] });
    expect(result.scope).toEqual({ cwd: "app", files: ["app/src/main/kotlin/payments/Charge.kt"] });
    const reasons = harness(result, "claude-code").rules.map((rule) => `${rule.path} ${rule.reason}`);
    expect(reasons).toContain(".claude/rules/payments.md glob:**/payments/**/*.kt");
  });

  test("a missing cwd comes back as such", async () => {
    const result = await createInspectAction(DEFAULT_CONFIG, root)({ cwd: "nowhere" });
    expect(result).toEqual({ missingFolder: "nowhere" });
  });

  test("a subfolder finds the root above it", async () => {
    const result = await inspect({}, {}, join(root, "app"));
    expect(result.scope.cwd).toBe("app");
    expect(harness(result, "codex").rules.map((rule) => rule.path)).toEqual(["AGENTS.md", "app/AGENTS.md"]);
  });
});

describe("one harness", () => {
  test("tokens add up, and what files can't tell stays unknown", async () => {
    const { tokens } = harness(await inspect({}), "claude-code");
    const sum = Object.values(tokens.byComponent).reduce((total, count) => total + count, 0);
    expect(tokens).toMatchObject({ known: sum, exact: false, calibration: "none" });
    expect(tokens.unknown).toEqual(["system", "tools", "mcp"]);
  });

  test("codex counts in its own tokenizer, so it needs no calibration", async () => {
    expect(harness(await inspect({}), "codex").tokens.calibration).toBeUndefined();
  });

  test("provenance names the file of every piece", async () => {
    const { provenance } = harness(await inspect({}), "claude-code");
    expect(provenance["rule:CLAUDE.md"]).toEqual({ source: "CLAUDE.md", reason: "cwd", evidence: "static" });
    expect(provenance["mcp:github"]?.source).toBe(".mcp.json");
    expect(provenance["mcp:legacy"]).toBeUndefined();
    expect(provenance["command:changelog"]?.source).toBe(".claude/commands/changelog.md");
  });

  test("problems come sorted by file and line", async () => {
    const paths = harness(await inspect({}), "claude-code").problems.map((problem) => problem.path);
    expect(paths).toEqual(paths.toSorted((a, b) => a.localeCompare(b)));
    expect(paths).toContain(".claude/rules/web.md");
  });
});
