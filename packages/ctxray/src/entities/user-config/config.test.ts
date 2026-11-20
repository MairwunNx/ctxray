import { expect, test } from "bun:test";
import type { UserConfig } from "#shared/contract/index.ts";
import { finalizeConfig } from "./config.ts";

// Unless the config names a count, an L6 test makes the fewest runs that can prove its thresholds.
test.each<[string, UserConfig, { min: number; max: number; runs: number }]>([
  ["no activate", {}, { min: 0.8, max: 0.2, runs: 16 }],
  ["a stricter min", { activate: { min: 0.9 } }, { min: 0.9, max: 0.2, runs: 35 }],
  ["a count of its own", { activate: { runs: 8 } }, { min: 0.8, max: 0.2, runs: 8 }],
])("L6 defaults with %s", (_, config, activate) => {
  expect(finalizeConfig(config, {}, []).activate).toEqual(activate);
});

test.each<[string, UserConfig, Record<string, string>, number]>([
  ["one session at a time by default", {}, {}, 1],
  ["the config raises it", { concurrency: 4 }, {}, 4],
  ["CTXRAY_CONCURRENCY beats the config", { concurrency: 4 }, { CTXRAY_CONCURRENCY: "2" }, 2],
  ["a CTXRAY_CONCURRENCY that isn't a count is ignored", { concurrency: 4 }, { CTXRAY_CONCURRENCY: "0" }, 4],
])("concurrency: %s", (_, config, env, concurrency) => {
  expect(finalizeConfig(config, env, []).concurrency).toBe(concurrency);
});
