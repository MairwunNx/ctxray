import { describe, expect, test as it } from "bun:test";
import type { MessageKey } from "#shared/i18n/index.ts";
import { type Collector, suite, test, withCollector } from "./dsl.ts";
import { CheckFailure } from "./failure.ts";
import { discover } from "./rules.ts";

const collect = async (register: () => void) => {
  const collector: Collector = { file: "/repo/tests/a.ctxray.ts", frames: [], tests: [], pending: [] };
  await withCollector(collector, async () => register());
  return collector.tests;
};

const noop = () => {};

describe("registration", () => {
  it("nests suites and inherits the fixture, relative to the test file", async () => {
    const tests = await collect(() =>
      suite("payments", { fixture: "../fixtures/app" }, () => {
        test.resolve("rules", noop);
        suite("refunds", () => test.activate("skill", { samples: 5 }, noop));
      }),
    );
    expect(tests.map(({ key, kind, fixture }) => [key, kind, fixture])).toEqual([
      ["payments › rules", "resolve", "/repo/fixtures/app"],
      ["payments › refunds › skill", "activate", "/repo/fixtures/app"],
    ]);
    expect(tests[1]?.options).toEqual({ samples: 5 });
  });

  it("numbers tests with the same name, so each keeps its own snapshot", async () => {
    const tests = await collect(() => {
      test.resolve("same", noop);
      test.resolve("same", noop);
    });
    expect(tests.map((definition) => definition.key)).toEqual(["same", "same (2)"]);
  });

  it("names .each tests from their item", async () => {
    const tests = await collect(() =>
      test.resolve.each([{ file: { path: "a.kt" } }, { file: { path: "b.kt" } }])("{file.path} loads {nope}", noop),
    );
    expect(tests.map((definition) => definition.name)).toEqual(["a.kt loads {nope}", "b.kt loads {nope}"]);
    expect(tests[0]?.item).toEqual({ file: { path: "a.kt" } });
  });

  it("keeps a discover set whole until the harness is known", async () => {
    const tests = await collect(() => test.resolve.each(discover.rules({ under: "app" }))("{rule.path}", noop));
    expect(tests).toHaveLength(1);
    expect(tests[0]?.rules).toBeDefined();
  });
});

describe("mistakes", () => {
  const key = async (register: () => void) => {
    try {
      await collect(register);
    } catch (error) {
      return (error as CheckFailure).key;
    }
    return undefined;
  };

  it.each<[string, () => void, MessageKey]>([
    ["an async suite", () => suite("later", (async () => {}) as () => void), "dsl.asyncSuite"],
    ["each over strings", () => test.resolve.each(["a"] as never)("x", noop), "dsl.eachItem"],
  ])("%s", async (_, register, expected) => {
    expect(await key(register)).toBe(expected);
  });

  it("calls outside a run", () => {
    expect(() => test.resolve("x", noop)).toThrow(CheckFailure);
  });
});
