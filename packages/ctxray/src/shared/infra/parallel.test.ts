import { describe, expect, test } from "bun:test";
import { allInOrder, inParallel } from "./parallel.ts";

const after = <T>(ms: number, value: T, fail = false) =>
  new Promise<T>((resolve, reject) => setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms));

describe("inParallel", () => {
  test("keeps the items' order, whatever finishes first", async () => {
    expect(await inParallel([30, 10, 20], (ms, index) => after(ms, index))).toEqual([0, 1, 2]);
  });

  test("never runs more than 64 tasks at once", async () => {
    let running = 0;
    let peak = 0;
    await inParallel(Array.from({ length: 200 }), async () => {
      peak = Math.max(peak, ++running);
      await after(1, 0);
      running--;
    });
    expect(peak).toBe(64);
  });
});

describe("allInOrder", () => {
  test("returns every value in order", async () => {
    expect(await allInOrder([after(20, "a"), after(5, "b")])).toEqual(["a", "b"]);
  });

  test("throws the first failure by position, not the first in time", async () => {
    const outcome = allInOrder([after(5, "fine"), after(30, "first", true), after(1, "second", true)]);
    await expect(outcome).rejects.toThrow("first");
  });
});
