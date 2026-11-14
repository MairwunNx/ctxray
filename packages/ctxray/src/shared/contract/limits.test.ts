import { describe, expect, test } from "bun:test";
import { DEFAULT_LIMITS, Limits, resolveLimits } from "./limits.ts";

describe("resolveLimits", () => {
  test("defaults: warnings for long skills, commands, and instruction files, no hard limits", () => {
    expect(DEFAULT_LIMITS.skill.lines).toEqual({ warning: 500, error: undefined });
    expect(DEFAULT_LIMITS.command.lines).toEqual({ warning: 500, error: undefined });
    expect(DEFAULT_LIMITS.instruction.chars).toEqual({ warning: 40_000, error: undefined });
    expect(DEFAULT_LIMITS.skill.tokens).toEqual({ warning: undefined, error: undefined });
  });

  test.each([
    [
      "a hard limit keeps the default warning",
      { skill: { lines: { error: 800 } } },
      "skill",
      "lines",
      { warning: 500, error: 800 },
    ],
    [
      "`false` turns the warning off",
      { skill: { lines: { warning: false } } },
      "skill",
      "lines",
      { warning: undefined, error: undefined },
    ],
    [
      "`false` turns a whole kind off",
      { instruction: false },
      "instruction",
      "chars",
      { warning: undefined, error: undefined },
    ],
    [
      "tokens get limits of their own",
      { command: { tokens: { warning: 2_000, error: 5_000 } } },
      "command",
      "tokens",
      { warning: 2_000, error: 5_000 },
    ],
  ] as const)("%s", (_, input, kind, measure, expected) => {
    expect(resolveLimits(Limits.parse(input))[kind][measure]).toEqual(expected);
  });

  test("rejects a limit that isn't a positive number or false", () => {
    expect(Limits.safeParse({ skill: { lines: { error: 0 } } }).success).toBe(false);
    expect(Limits.safeParse({ skill: { lines: { error: true } } }).success).toBe(false);
  });
});
