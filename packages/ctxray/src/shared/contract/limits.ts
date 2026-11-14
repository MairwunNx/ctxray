import { z } from "zod";

// Built-in size limits of L1, for each kind of file and each measure. A warning reports, an error fails the
// run, `false` turns a threshold off, and `false` for a whole kind turns its checks off.
export const SIZE_KINDS = ["skill", "command", "instruction"] as const;
export type SizeKind = (typeof SIZE_KINDS)[number];
export const MEASURES = ["lines", "chars", "tokens"] as const;
export type Measure = (typeof MEASURES)[number];

const Bound = z.union([z.number().int().positive(), z.literal(false)]);
const Threshold = z.strictObject({
  warning: Bound.optional().describe("Above this, L1 warns. `false` turns the warning off"),
  error: Bound.optional().describe("Above this, L1 fails. `false` turns the hard limit off"),
});
const KindLimits = z.strictObject({
  lines: Threshold.optional(),
  chars: Threshold.optional(),
  tokens: Threshold.optional().describe("Counted with the local o200k tokenizer, as everywhere in ctxray"),
});

export const Limits = z
  .strictObject({
    skill: z
      .union([KindLimits, z.literal(false)])
      .optional()
      .describe("A SKILL.md body"),
    command: z
      .union([KindLimits, z.literal(false)])
      .optional()
      .describe("A command's body"),
    instruction: z
      .union([KindLimits, z.literal(false)])
      .optional()
      .describe("CLAUDE.md, AGENTS.md, a rule, or any other instruction file"),
  })
  .describe("Size limits for each skill, command, and instruction file");
export type LimitsInput = z.output<typeof Limits>;

export type ResolvedThreshold = { warning: number | undefined; error: number | undefined };
export type ResolvedLimits = Record<SizeKind, Record<Measure, ResolvedThreshold>>;

const NONE: ResolvedThreshold = { warning: undefined, error: undefined };

// Anthropic asks for a SKILL.md under 500 lines, and Claude Code warns about instructions over 40,000 characters.
const DEFAULTS: Record<SizeKind, Partial<Record<Measure, ResolvedThreshold>>> = {
  skill: { lines: { warning: 500, error: undefined } },
  command: { lines: { warning: 500, error: undefined } },
  instruction: { chars: { warning: 40_000, error: undefined } },
};

const bound = (value: number | false | undefined, fallback: number | undefined) =>
  value === false ? undefined : (value ?? fallback);

// The config's limits over the defaults: a threshold the config doesn't name keeps its default.
export const resolveLimits = (limits: LimitsInput | undefined): ResolvedLimits => {
  const resolved = {} as ResolvedLimits;
  for (const kind of SIZE_KINDS) {
    const own = limits?.[kind];
    resolved[kind] = {} as Record<Measure, ResolvedThreshold>;
    for (const measure of MEASURES) {
      const fallback = own === false ? NONE : (DEFAULTS[kind][measure] ?? NONE);
      const set = own === false ? undefined : own?.[measure];
      resolved[kind][measure] = {
        warning: bound(set?.warning, fallback.warning),
        error: bound(set?.error, fallback.error),
      };
    }
  }
  return resolved;
};

export const DEFAULT_LIMITS: ResolvedLimits = resolveLimits(undefined);
