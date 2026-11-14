import { describe, expect, test } from "bun:test";
import type { HarnessId } from "#shared/contract/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import type { CheckFailure } from "./failure.ts";
import { discover, type RuleSelector, selectRules } from "./rules.ts";
import { scopeIn } from "./scope.fixture.ts";
import { inCell } from "./scope.ts";

const paths = async (harness: HarnessId, ...selectors: RuleSelector[]) => {
  const [first, ...rest] = selectors;
  const set = rest.reduce((at, selector) => at.where(selector), discover.rules(first));
  return selectRules(await scopeIn(harness), set).map((rule) => rule.path);
};

describe("discover.rules on the payments fixture", () => {
  test.each<[string, HarnessId, RuleSelector[], string[]]>([
    [
      "by owner",
      "claude-code",
      [{ owner: "@ACME/payments" }],
      ["app/src/main/kotlin/payments/AGENTS.md", ".claude/rules/payments.md", ".claude/skills/refunds/SKILL.md"],
    ],
    [
      "owner and activation",
      "claude-code",
      [{ owner: "@acme/payments" }, { activation: "path" }],
      [".claude/rules/payments.md"],
    ],
    [
      "several activations",
      "claude-code",
      [{ activation: ["intent", "manual"] }],
      [".claude/skills/payouts/SKILL.md", ".claude/skills/refunds/SKILL.md", ".claude/skills/release/SKILL.md"],
    ],
    [
      "under a folder",
      "codex",
      [{ under: "./app/" }],
      ["app/AGENTS.md", "app/src/main/kotlin/payments/AGENTS.md", "app/.agents/skills/android-build/SKILL.md"],
    ],
    ["under a glob", "codex", [{ under: "**/payments/*.md" }], ["app/src/main/kotlin/payments/AGENTS.md"]],
  ])("%s for %s", async (_, harness, selectors, expected) => {
    expect(await paths(harness, ...selectors)).toEqual(expected);
  });

  test.each<[string, RuleSelector[], MessageKey]>([
    ["an empty selection fails", [{ owner: "@nobody" }], "discover.empty"],
    ["a typo in a folder fails", [{ under: "ap" }], "discover.empty"],
  ])("%s", async (_, selectors, key) => {
    const error = await paths("codex", ...selectors).catch((caught: CheckFailure) => caught);
    expect((error as CheckFailure).key).toBe(key);
  });

  test("an owner without CODEOWNERS fails", async () => {
    const scope = await scopeIn("codex");
    const bare = { ...scope, workspace: { ...scope.workspace, codeowners: undefined } };
    expect(() => selectRules(bare, discover.rules({ owner: "@acme/payments" }))).toThrow("needs a CODEOWNERS file");
  });
});

describe("a set inside a test", () => {
  test.each<[RuleSelector, string]>([
    [{ under: "app/src/**" }, "app/src"],
    [{ owner: "@acme/payments", activation: "always" }, "app/src/main/kotlin/payments"],
    [{ owner: "@acme/payments" }, ""],
  ])("%p lives in %p", async (selector, root) => {
    expect(inCell(await scopeIn("claude-code"), () => discover.rules(selector).root)).toBe(root);
  });

  test("outside a test it can't know the harness", () => {
    expect(() => discover.rules().rules).toThrow("only inside a running test");
  });

  test("a rule knows the files that load it", async () => {
    const [rule] = selectRules(await scopeIn("claude-code"), discover.rules({ under: ".claude/rules/kotlin.md" }));
    expect(rule?.matchingFiles()).toEqual([
      "app/src/main/kotlin/payments/Charge.kt",
      "app/src/main/kotlin/web/Page.kt",
    ]);
    expect(rule?.matchingFiles({ sample: 1 })).toEqual(["app/src/main/kotlin/payments/Charge.kt"]);
    expect(rule?.nonMatchingFile()).toBe(".agents/skills/refunds/SKILL.md");
  });
});
