import { expect as bunExpect, describe, test } from "bun:test";
import { expect } from "./expect.ts";
import { CheckFailure } from "./failure.ts";
import { resolveIn } from "./loadout.ts";
import { discover } from "./rules.ts";
import { scopeIn } from "./scope.fixture.ts";
import { type CellScope, inCell } from "./scope.ts";

const RULES = [{ path: "CLAUDE.md" }, { path: ".claude/rules/kotlin.md" }, { name: "refunds", path: "x/SKILL.md" }];

// The failure's call and its lines, or "passed".
const outcome = (check: () => void) => {
  try {
    check();
    return "passed";
  } catch (error) {
    if (!(error instanceof CheckFailure)) throw error;
    return [error.params["call"], ...error.lines.map((line) => `${line.label}: ${line.value}`)].join(" | ");
  }
};

describe("matchers", () => {
  test.each<[string, () => void, string]>([
    ["toBe", () => expect(5).toBe(5), "passed"],
    [
      "toBe tells strings from numbers",
      () => expect("5").toBe(5),
      'expect(received).toBe(expected) | expect.expected: 5 | expect.received: "5"',
    ],
    [
      "not.toBe",
      () => expect(5).not.toBe(5),
      "expect(received).not.toBe(expected) | expect.notExpected: 5 | expect.received: 5",
    ],
    ["toEqual", () => expect({ a: [1] }).toEqual({ a: [1] }), "passed"],
    [
      "toBeLessThan",
      () => expect(27_104).toBeLessThan(25_000),
      "expect(received).toBeLessThan(25000) | expect.expected: 25000 | expect.received: 27104",
    ],
    ["toBeGreaterThanOrEqual", () => expect(3).toBeGreaterThanOrEqual(3), "passed"],
    [
      "a limit on a non-number",
      () => expect("x").toBeLessThan(1),
      'expect(received).toBeLessThan(1) | expect.notNumber: "x"',
    ],
    ["toHaveLength", () => expect([1, 2]).toHaveLength(2), "passed"],
    ["toMatch", () => expect("glob:**/*.kt").toMatch(/^glob:/), "passed"],
    ["toBeUndefined", () => expect(undefined).toBeUndefined(), "passed"],
    ["toInclude by path", () => expect(RULES).toInclude(["CLAUDE.md", ".claude/rules/kotlin.md"]), "passed"],
    ["toInclude by name", () => expect(RULES).toInclude("refunds"), "passed"],
    [
      "toInclude lists what is missing",
      () => expect(RULES).toInclude(["CLAUDE.md", "AGENTS.md"]),
      "expect(received).toInclude(expected) | expect.missing: AGENTS.md | expect.received: CLAUDE.md, .claude/rules/kotlin.md, x/SKILL.md",
    ],
    ["not.toInclude passes when none is there", () => expect(RULES).not.toInclude(["AGENTS.md", "web.md"]), "passed"],
    [
      "not.toInclude fails on any one",
      () => expect(RULES).not.toInclude(["AGENTS.md", "CLAUDE.md"]),
      "expect(received).not.toInclude(expected) | expect.unexpected: CLAUDE.md | expect.received: CLAUDE.md, .claude/rules/kotlin.md, x/SKILL.md",
    ],
    ["toInclude on strings", () => expect(["github", "jira"]).toInclude("jira"), "passed"],
  ])("%s", (_, check, expected) => {
    bunExpect(outcome(check)).toBe(expected);
  });
});

describe("in a test on the payments fixture", () => {
  const within = async (harness: "claude-code" | "codex", body: (scope: CellScope) => Promise<unknown> | unknown) => {
    const scope = await scopeIn(harness, (value) => snapshots.push(value));
    return inCell(scope, () => body(scope));
  };
  const snapshots: unknown[] = [];

  test("toInclude takes a discover set", async () => {
    await within("claude-code", async (scope) => {
      const loadout = await resolveIn(scope)({ files: ["app/src/main/kotlin/payments/Charge.kt"] });
      expect(loadout.rules).toInclude(discover.rules({ activation: "path", under: ".claude/rules/payments.md" }));
      expect(loadout.rules.get(".claude/rules/payments.md").reason).toBe("glob:**/payments/**/*.kt");
    });
  });

  test("get names what the list holds", async () => {
    await within("codex", async (scope) => {
      const loadout = await resolveIn(scope)();
      bunExpect(() => loadout.rules.get("CLAUDE.md")).toThrow("rules holds no “CLAUDE.md”. It holds: AGENTS.md");
    });
  });

  test("expect.on holds for the named harnesses only", async () => {
    const seen: string[] = [];
    for (const harness of ["claude-code", "codex"] as const) {
      await within(harness, () => expect.on(["codex"], () => seen.push(harness)));
    }
    bunExpect(seen).toEqual(["codex"]);
  });

  test("toMatchLoadoutSnapshot hands the snapshot to the cell", async () => {
    await within("codex", async (scope) => expect(await resolveIn(scope)({ cwd: "app" })).toMatchLoadoutSnapshot());
    bunExpect(snapshots.at(-1)).toMatchObject({ rules: { "AGENTS.md": { activation: "always" } }, commands: [] });
    bunExpect(() => expect({}).toMatchLoadoutSnapshot()).toThrow("takes a loadout from resolve()");
  });

  test("resolve refuses a folder the project lacks", async () => {
    const error = await within("codex", (scope) => resolveIn(scope)({ cwd: "nowhere" }).catch((caught) => caught));
    bunExpect((error as CheckFailure).key).toBe("resolve.noFolder");
  });
});
