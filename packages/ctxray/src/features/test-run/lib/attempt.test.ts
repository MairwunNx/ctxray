import { expect, test } from "bun:test";
import { attempt } from "./attempt.ts";
import { CheckFailure, Inconclusive } from "./failure.ts";

// A body that fails its first `failures` runs, then passes.
const failingFirst = (failures: number, error: () => unknown = () => new Error("boom")) => {
  let runs = 0;
  return () => {
    runs++;
    if (runs <= failures) throw error();
  };
};

test.each<[string, () => unknown, { retries?: number; timeout?: number }, string, number]>([
  ["a pass", () => {}, {}, "passed", 1],
  ["an async pass", async () => {}, {}, "passed", 1],
  ["a failure", failingFirst(9), {}, "failed", 1],
  ["a failure on every retry", failingFirst(9), { retries: 2 }, "failed", 3],
  ["a pass on a retry", failingFirst(1), { retries: 2 }, "flaky", 2],
  [
    "an inconclusive sample",
    failingFirst(9, () => new Inconclusive("test.timeout")),
    { retries: 2 },
    "inconclusive",
    1,
  ],
  ["a timeout", () => new Promise(() => {}), { timeout: 20 }, "failed", 1],
])("%s", async (_, body, options, status, attempts) => {
  expect(await attempt(body, options)).toMatchObject({ status, attempts });
});

test("a flaky pass keeps the failure it got over", async () => {
  const outcome = await attempt(failingFirst(1), { retries: 1 });
  expect(outcome.failure).toEqual({ kind: "error", message: "boom", where: undefined });
});

test("a check failure keeps its key, an error its message", async () => {
  const check = await attempt(failingFirst(1, () => new CheckFailure("test.timeout", { ms: 5 })));
  expect(check.failure).toEqual({ kind: "check", key: "test.timeout", params: { ms: 5 }, lines: [] });
  const thrown = await attempt(failingFirst(1, () => "a string"));
  expect(thrown.failure).toEqual({ kind: "error", message: "a string", where: undefined });
});
