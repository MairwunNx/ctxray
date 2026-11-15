import { z } from "zod";
import { Component } from "./loadout.ts";

// `*.ctxray.jsonc`: the tests of the TypeScript DSL for the simple cases, as data. ctxray turns each into
// the same test the DSL registers.
const Ids = z.array(z.string());
export const ListExpect = z
  .strictObject({
    include: Ids.optional().describe("Every one of these is there"),
    exclude: Ids.optional().describe("None of these is there"),
    equal: Ids.optional().describe("Exactly these, in this order"),
  })
  .describe("Paths or names a list holds");

export const Bound = z
  .strictObject({
    lessThan: z.number().optional(),
    atMost: z.number().optional(),
    moreThan: z.number().optional(),
    atLeast: z.number().optional(),
  })
  .describe("Limits a number stays within");

export const LoadoutExpect = z.strictObject({
  rules: ListExpect.optional(),
  skills: z.strictObject({ listed: ListExpect.optional(), loaded: ListExpect.optional() }).optional(),
  mcp: z.strictObject({ servers: ListExpect.optional() }).optional(),
  commands: ListExpect.optional(),
  tokens: z
    .strictObject({
      total: Bound.optional(),
      byComponent: z.partialRecord(Component, Bound).optional(),
      byMcpServer: z.record(z.string(), Bound).optional(),
    })
    .optional(),
  snapshot: z.boolean().optional().describe("Match the loadout snapshot, L3 to L5"),
});

const Requires = z.array(z.string()).optional().describe("Capabilities the harness needs, like skills or pathRules");
const base = { name: z.string().min(1), requires: Requires, retries: z.number().int().nonnegative().optional() };

const Step = z.strictObject({
  read: z.string().optional().describe("The mock model reads this file"),
  call: z.strictObject({ tool: z.string(), input: z.record(z.string(), z.unknown()).optional() }).optional(),
  say: z.string().optional().describe("The mock model answers with text"),
  expect: LoadoutExpect.extend({
    agreeWithResolver: z.boolean().optional().describe("The harness loaded what L3 predicts"),
  }).optional(),
});

const Group = z.enum(["all", "positive", "negative"]);
export const ActivationExpect = z
  .strictObject({
    skill: z.string().optional(),
    rule: z.string().optional(),
    anyOf: Ids.optional(),
    min: z.number().min(0).max(1).optional().describe("The lower bound of the rate must reach it"),
    max: z.number().min(0).max(1).optional().describe("The upper bound must stay under it: the subject must not load"),
    runs: Group.optional().describe("Which prompts' runs count, all by default"),
  })
  .describe("A skill, a rule, or any of several, and the rate it should load at");

const prompts = {
  prompt: z.string().optional(),
  positive: Ids.optional(),
  negative: Ids.optional(),
  corpus: z.string().optional().describe("A JSON file with positive and negative prompts, relative to this file"),
  samples: z.number().int().positive().optional(),
  turns: z.number().int().positive().optional(),
  cwd: z.string().optional(),
};

export const DeclarativeTest = z.discriminatedUnion("layer", [
  z.strictObject({
    ...base,
    layer: z.literal("L3"),
    cwd: z.string().optional(),
    files: Ids.optional(),
    expect: LoadoutExpect,
  }),
  z.strictObject({ ...base, layer: z.literal("L4"), cwd: z.string().optional(), expect: LoadoutExpect }),
  z.strictObject({ ...base, layer: z.literal("L5"), cwd: z.string().optional(), steps: z.array(Step).min(1) }),
  z.strictObject({ ...base, layer: z.literal("L6"), ...prompts, expect: z.array(ActivationExpect).min(1) }),
  z.strictObject({
    ...base,
    layer: z.literal("L7"),
    ...prompts,
    min: z.number().min(0).max(1).optional().describe("The share of runs that must pass, all of them by default"),
    expect: z.strictObject({
      changed: ListExpect.optional().describe("Files the agent changed"),
      tools: ListExpect.optional().describe("Tools the agent called"),
      skills: ListExpect.optional().describe("Skills that loaded"),
      rules: ListExpect.optional().describe("Rules that loaded"),
    }),
  }),
]);
export type DeclarativeTest = z.output<typeof DeclarativeTest>;

export const DeclarativeTests = z
  .strictObject({
    $schema: z.string().optional(),
    suites: z.array(
      z.strictObject({
        name: z.string().min(1),
        fixture: z.string().optional().describe("The project folder, relative to this file"),
        tests: z.array(DeclarativeTest),
      }),
    ),
  })
  .describe("ctxray tests as data: a `*.ctxray.jsonc` file");
export type DeclarativeTests = z.output<typeof DeclarativeTests>;
export type LoadoutExpect = z.output<typeof LoadoutExpect>;
export type ListExpect = z.output<typeof ListExpect>;
export type Bound = z.output<typeof Bound>;
