import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDeclarative } from "./declarative.ts";
import { type Collector, withCollector } from "./dsl.ts";
import { CheckFailure } from "./failure.ts";
import { resolveIn } from "./loadout.ts";
import { scopeIn } from "./scope.fixture.ts";
import { inCell } from "./scope.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const collect = async (text: string, files: Record<string, string> = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "ctxray-declarative-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) await Bun.write(join(dir, path), content);
  const collector: Collector = { file: join(dir, "a.ctxray.jsonc"), frames: [], tests: [], pending: [] };
  await withCollector(collector, async () => {
    registerDeclarative(text);
    await Promise.all(collector.pending);
  });
  return collector.tests;
};

const FILE = `{
  // Comments and trailing commas, as in any JSONC.
  "suites": [{
    "name": "payments",
    "fixture": "../payments",
    "tests": [
      { "layer": "L3", "name": "rules on read", "cwd": "app", "files": ["app/src/main/kotlin/payments/Charge.kt"],
        "expect": { "rules": { "include": [".claude/rules/payments.md"], "exclude": [".claude/rules/web.md"] } } },
      { "layer": "L4", "name": "budget", "expect": { "tokens": { "total": { "lessThan": 25000 } } } },
      { "layer": "L5", "name": "nested", "requires": ["pathRules"], "steps": [{ "read": "a.kt", "expect": { "agreeWithResolver": true } }] },
      { "layer": "L6", "name": "refunds", "corpus": "prompts.json", "samples": 3,
        "expect": [{ "skill": "refunds", "min": 0.9, "runs": "positive" }, { "skill": "payouts", "max": 0.05 }] },
      { "layer": "L7", "name": "refund", "prompt": "Refund order 5", "min": 0.8, "expect": { "tools": { "include": ["Skill"] } } },
    ],
  }],
}`;

describe("declarative tests", () => {
  test("every layer becomes the test the DSL registers", async () => {
    const tests = await collect(FILE, { "prompts.json": '{ "positive": ["Refund 5"], "negative": ["Show 5"] }' });
    expect(tests.map(({ key, kind }) => [key, kind])).toEqual([
      ["payments › rules on read", "resolve"],
      ["payments › budget", "assemble"],
      ["payments › nested", "wire"],
      ["payments › refunds", "activate"],
      ["payments › refund", "scenario"],
    ]);
    expect(tests[2]?.options.requires).toEqual(["pathRules"]);
    expect(tests[3]?.options).toMatchObject({ positive: ["Refund 5"], negative: ["Show 5"], samples: 3 });
    expect(tests[4]?.options).toMatchObject({ prompt: "Refund order 5", min: 0.8 });
    expect(tests[0]?.fixture?.endsWith("/payments")).toBe(true);
  });

  test("an L3 test checks what the resolver predicts", async () => {
    const [resolve] = await collect(FILE);
    const scope = await scopeIn("claude-code");
    await inCell(scope, () => resolve?.body({ resolve: resolveIn(scope) }));
  });

  test("a file outside the schema names where", async () => {
    const thrown = await collect('{ "suites": [{ "name": "x", "tests": [{ "layer": "L9", "name": "y" }] }] }').catch(
      (error: unknown) => error,
    );
    expect(thrown instanceof CheckFailure && [thrown.key, thrown.params["path"]]).toEqual([
      "declarative.invalid",
      "suites.0.tests.0.layer",
    ]);
  });
});
