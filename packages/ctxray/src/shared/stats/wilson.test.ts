import { describe, expect, test } from "bun:test";
import { fewestToProve, judge, type Threshold, type Verdict, wilson } from "./wilson.ts";

const round = (value: number) => Math.round(value * 1000) / 1000;

describe("wilson", () => {
  test.each<[number, number, number, number]>([
    [9, 10, 0.596, 0.982],
    [10, 10, 0.722, 1],
    [0, 10, 0, 0.278],
    [19, 20, 0.764, 0.991],
    [14, 20, 0.481, 0.855],
    [18, 20, 0.699, 0.972],
    [50, 100, 0.404, 0.596],
  ])("%i of %i lies in [%d, %d]", (successes, samples, low, high) => {
    const interval = wilson(successes, samples);
    expect([round(interval.low), round(interval.high)]).toEqual([low, high]);
  });

  test("no samples know nothing", () => {
    expect(wilson(0, 0)).toEqual({ rate: 0, low: 0, high: 1 });
  });
});

describe("judge", () => {
  test.each<[string, number, number, Threshold, Verdict, number | undefined]>([
    ["the lower bound clears min", 19, 20, { min: 0.75 }, "passed", undefined],
    ["the rate misses min", 14, 20, { min: 0.9 }, "failed", undefined],
    ["the rate clears min, the bound doesn't", 18, 20, { min: 0.9 }, "inconclusive", undefined],
    ["the rate clears min well, the bound doesn't", 19, 20, { min: 0.8 }, "inconclusive", 28],
    ["the upper bound stays under max", 0, 60, { max: 0.07 }, "passed", undefined],
    ["the rate passes max", 3, 20, { max: 0.05 }, "failed", undefined],
    ["the rate stays under max, the bound doesn't", 0, 20, { max: 0.05 }, "inconclusive", 73],
    ["10 out of 10 against min 1 never settles", 10, 10, { min: 1 }, "inconclusive", undefined],
    ["no samples", 0, 0, { min: 0.5 }, "inconclusive", undefined],
  ])("%s", (_, successes, samples, threshold, verdict, needed) => {
    const judged = judge(successes, samples, threshold);
    expect([judged.verdict, judged.needed]).toEqual([verdict, needed]);
  });

  test("the samples it asks for settle the question", () => {
    const { needed } = judge(19, 20, { min: 0.8 });
    if (needed === undefined) throw new Error("no estimate");
    expect(wilson(0.95 * needed, needed).low).toBeGreaterThanOrEqual(0.8);
    expect(wilson(0.95 * (needed - 1), needed - 1).low).toBeLessThan(0.8);
  });
});

// A perfect run passes from this many samples on, and one fewer leaves it inconclusive.
test.each<[Threshold, number]>([
  [{ min: 0.9 }, 35],
  [{ min: 0.8 }, 16],
  [{ max: 0.2 }, 16],
  [{ max: 0.1 }, 35],
])("%p needs %i samples to be proved", (threshold, samples) => {
  expect(fewestToProve(threshold)).toBe(samples);
  const perfect = (count: number) => ("min" in threshold ? count : 0);
  expect(judge(perfect(samples), samples, threshold).verdict).toBe("passed");
  expect(judge(perfect(samples - 1), samples - 1, threshold).verdict).toBe("inconclusive");
});
