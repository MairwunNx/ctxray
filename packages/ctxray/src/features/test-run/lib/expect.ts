import type { HarnessId } from "#shared/contract/index.ts";
import { captureMatchers } from "./expect-capture.ts";
import { runMatchers } from "./expect-runs.ts";
import { CheckFailure, type FailureLine, fail, show } from "./failure.ts";
import { idOf } from "./loadout.ts";
import { isRuleSet, selectRules } from "./rules.ts";
import { currentCell } from "./scope.ts";
import { attachedSnapshot } from "./snapshot.ts";

// What `toInclude` compares by: a rule's path, a skill's or server's name, or the string itself.
const idsOf = (value: unknown): string[] => {
  if (isRuleSet(value)) return selectRules(currentCell(), value).map((rule) => rule.path);
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => (typeof item === "string" ? item : idOf(item as { path?: string; name?: string })));
};

const matchesId = (entry: unknown, id: string) => {
  if (typeof entry === "string") return entry === id;
  const { path, name } = (entry ?? {}) as { path?: unknown; name?: unknown };
  return path === id || name === id;
};

const isEntryList = (value: unknown): value is unknown[] =>
  Array.isArray(value) && typeof (value as { get?: unknown }).get === "function";

const number = (value: unknown, call: string): number =>
  typeof value === "number"
    ? value
    : fail("expect.failed", { call }, [{ label: "expect.notNumber", value: show(value) }]);

const matchers = (actual: unknown, negated: boolean) => {
  const not = negated ? ".not" : "";
  // `pass` says whether the plain matcher holds; `.not` flips it.
  const check = (pass: boolean, matcher: string, lines: () => FailureLine[]) => {
    if (pass === negated)
      throw new CheckFailure("expect.failed", { call: `expect(received)${not}.${matcher}` }, lines());
  };
  const versus = (expected: unknown) => (): FailureLine[] => [
    { label: negated ? "expect.notExpected" : "expect.expected", value: show(expected) },
    { label: "expect.received", value: show(actual) },
  ];
  const compare = (matcher: string, limit: number, holds: (value: number) => boolean) =>
    check(holds(number(actual, `expect(received).${matcher}(${limit})`)), `${matcher}(${limit})`, versus(limit));

  return {
    toBe: (expected: unknown) => check(Object.is(actual, expected), "toBe(expected)", versus(expected)),
    // An entry list equals a list of strings when it holds those ids in that order: `toEqual(["github", "jira"])`.
    toEqual: (expected: unknown) => {
      const byIds =
        isEntryList(actual) && Array.isArray(expected) && expected.every((item) => typeof item === "string");
      const received = byIds ? actual.map((entry) => idsOf(entry)[0]) : actual;
      check(Bun.deepEquals(received, expected), "toEqual(expected)", versus(expected));
    },
    toBeDefined: () => check(actual !== undefined, "toBeDefined()", versus(undefined)),
    toBeUndefined: () => check(actual === undefined, "toBeUndefined()", versus(undefined)),
    toBeLessThan: (limit: number) => compare("toBeLessThan", limit, (value) => value < limit),
    toBeLessThanOrEqual: (limit: number) => compare("toBeLessThanOrEqual", limit, (value) => value <= limit),
    toBeGreaterThan: (limit: number) => compare("toBeGreaterThan", limit, (value) => value > limit),
    toBeGreaterThanOrEqual: (limit: number) => compare("toBeGreaterThanOrEqual", limit, (value) => value >= limit),
    toHaveLength: (length: number) =>
      check((actual as { length?: unknown })?.length === length, "toHaveLength(expected)", versus(length)),
    toMatch: (pattern: RegExp | string) =>
      check(
        typeof actual === "string" && (typeof pattern === "string" ? actual.includes(pattern) : pattern.test(actual)),
        "toMatch(expected)",
        versus(pattern),
      ),
    // Every expected id is there; with `.not`, none of them is.
    toInclude: (expected: unknown) => {
      const entries = Array.isArray(actual) ? actual : [];
      const ids = idsOf(expected);
      const present = ids.filter((id) => entries.some((entry) => matchesId(entry, id)));
      const missing = ids.filter((id) => !present.includes(id));
      check(negated ? present.length > 0 : missing.length === 0, "toInclude(expected)", () => [
        negated
          ? { label: "expect.unexpected", value: present.join(", ") }
          : { label: "expect.missing", value: missing.join(", ") },
        { label: "expect.received", value: entries.map((entry) => idsOf(entry)[0]).join(", ") || "—" },
      ]);
    },
    ...captureMatchers(actual, negated, check),
    ...runMatchers(actual),
    toMatchLoadoutSnapshot: () => {
      if (negated) fail("expect.noNot", { matcher: "toMatchLoadoutSnapshot()" });
      const snapshot = attachedSnapshot(actual) ?? fail("expect.notLoadout", { received: show(actual) });
      currentCell().snapshot(snapshot.value, snapshot.variant);
    },
  };
};

type Matchers = ReturnType<typeof matchers> & { not: ReturnType<typeof matchers> };

// `expect.on("codex", () => …)` holds expectations for some harnesses only.
const on = (harnesses: HarnessId | readonly HarnessId[], body: () => unknown): unknown => {
  const ids: readonly HarnessId[] = typeof harnesses === "string" ? [harnesses] : harnesses;
  return ids.includes(currentCell().harness) ? body() : undefined;
};

export const expect = Object.assign(
  (actual: unknown): Matchers => ({ ...matchers(actual, false), not: matchers(actual, true) }),
  { on },
);
