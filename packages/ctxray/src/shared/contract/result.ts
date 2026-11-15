import { z } from "zod";

export const Layer = z
  .enum(["L1", "L2", "L3", "L4", "L5", "L6", "L7"])
  .describe("L1 Lint, L2 Policy, L3 Resolve, L4 Assemble, L5 Wire, L6 Activate, L7 Scenario");
export type Layer = z.infer<typeof Layer>;

export const TestStatus = z
  .enum(["passed", "failed", "skipped", "inconclusive", "flaky"])
  .describe("inconclusive: L6 and L7 statistics can't tell yet. flaky: failed at first, passed on a retry");
export type TestStatus = z.infer<typeof TestStatus>;

export const SkipReason = z
  .enum(["unsupported", "filtered", "unavailable", "backend", "budget"])
  .describe(
    "unsupported: the harness lacks a capability the test requires. filtered: --layer or --filter left it out. " +
      "unavailable: this ctxray can't run the layer here. backend: L6 and L7 need a model, replay or real. " +
      "budget: the run spent its budget before the test started",
  );
export type SkipReason = z.infer<typeof SkipReason>;
