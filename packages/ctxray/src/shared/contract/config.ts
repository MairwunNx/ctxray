import { z } from "zod";
import { HarnessId } from "./harness.ts";
import { Limits } from "./limits.ts";
import { LintConfig } from "./lint.ts";
import type { Component } from "./loadout.ts";

// Custom issues carry a catalog key in `params.key`, so the CLI shows them in the user's language.
const issue = (key: string) => ({ params: { key } });

const isRegExpSource = (source: string) => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};

// ctxray.config.ts passes a RegExp. JSON has none, so ctxray.config.jsonc passes the source as a string.
export const RegExpValue = z.instanceof(RegExp);
export const RedactPattern = z
  .union([z.string().refine(isRegExpSource, issue("config.badPattern")), RegExpValue])
  .transform((value) => (typeof value === "string" ? new RegExp(value) : value))
  .describe("A regular expression whose matches get redacted, on top of the built-in patterns");

export const HarnessSettings = z.strictObject({
  version: z.string().optional().describe("npm version range to install, like `2.x`"),
  source: z.enum(["registry", "system"]).optional().describe("`system` runs the harness found in PATH"),
  model: z.string().optional().describe("Model slug the harness runs with"),
  provider: z.string().optional().describe("Model provider, for harnesses that support several"),
  userScope: z
    .enum(["isolated", "inherit"])
    .optional()
    .describe("`inherit` lets your own user-level rules, skills, and settings into the run"),
  experimental: z
    .boolean()
    .optional()
    .describe("Turn on modes that rest on undocumented builds, like Cursor CLI's capture through its local build"),
  concurrency: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("At most this many sessions of this harness at once, under the run's `concurrency`"),
});
export type HarnessSettings = z.output<typeof HarnessSettings>;

export const Backend = z.enum(["mock", "replay", "real"]);
export type Backend = z.infer<typeof Backend>;

const limit = z.number().int().positive().optional();
// One limit per loadout component, the same names as `Component`, plus the total.
const TokenLimits = z.strictObject({
  total: limit,
  system: limit,
  rules: limit,
  skills: limit,
  mcp: limit,
  commands: limit,
  tools: limit,
} satisfies Record<Component | "total", unknown>);

// A file may only adjust an inherited policy, like its severity, so "checks something" holds after the merge.
export const POLICY_CHECKS = ["maxTokens", "denyMcp", "requireMcp", "requireFiles"] as const;

export const Policy = z.strictObject({
  id: z.string().min(1).describe("Unique name: a project policy with an inherited id replaces its fields"),
  severity: z.enum(["error", "warning"]).optional().describe("`warning` reports without failing, `error` by default"),
  harnesses: z.array(HarnessId).optional().describe("Harnesses the policy applies to, all by default"),
  maxTokens: TokenLimits.optional().describe("Token limits, in total and per component"),
  denyMcp: z.array(z.string()).optional().describe("MCP servers that must not be configured"),
  requireMcp: z.array(z.string()).optional().describe("MCP servers that must be configured"),
  requireFiles: z.array(z.string()).optional().describe("Files that must exist, relative to the project root"),
});
export type Policy = z.output<typeof Policy>;

const uniqueIds = (policies: readonly { id: string }[]) =>
  new Set(policies.map((policy) => policy.id)).size === policies.length;

export const Network = z.strictObject({
  proxy: z.string().optional().describe("HTTP(S) proxy URL, overrides HTTPS_PROXY and HTTP_PROXY"),
  noProxy: z.array(z.string()).optional().describe("Hosts that skip the proxy, overrides NO_PROXY"),
  ca: z.array(z.string()).optional().describe("PEM files with extra CA certificates, relative to this config"),
  systemCa: z.boolean().optional().describe("Trust the system certificate store too"),
  registry: z
    .string()
    .url()
    .optional()
    .describe("npm registry harnesses install from, overrides .npmrc and NPM_CONFIG_REGISTRY"),
});
export type Network = z.output<typeof Network>;

const usd = z.number().nonnegative();
export const Price = z
  .strictObject({
    input: usd.describe("US dollars per million input tokens"),
    output: usd.describe("US dollars per million output tokens"),
    cacheRead: usd.optional().describe("Per million cached input tokens, the input price if unset"),
    cacheWrite: usd.optional().describe("Per million tokens written to the cache, the input price if unset"),
  })
  .describe("What a model costs");
export type Price = z.output<typeof Price>;

export const Budget = z
  .strictObject({
    usd: usd.optional().describe("Stop sending to the real model once the run cost this much"),
    tokens: z.number().int().positive().optional().describe("Stop once the run used this many tokens"),
  })
  .describe("Limits of a run with the real backend");
export type Budget = z.output<typeof Budget>;

const share = z.number().min(0).max(1);
export const ActivateDefaults = z
  .strictObject({
    min: share.optional().describe("Share of runs a skill or rule must load in for toActivate(): 0.8 by default"),
    max: share.optional().describe("Share of runs it may load in at most for .not.toActivate(): 0.2 by default"),
    runs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Runs of an L6 test without `samples`, split between its prompts. By default the fewest that can prove the thresholds",
      ),
  })
  .describe("Defaults of L6 Activate: its thresholds, and how many runs a test makes");
export type ActivateDefaults = z.output<typeof ActivateDefaults>;

export const Reporter = z.enum(["console", "html", "junit", "allure", "json", "markdown"]);

// What a config file holds. Every field is optional: `extends` fills the gaps, and defaults fill the rest.
export const UserConfig = z
  .strictObject({
    $schema: z.string().optional().describe("JSON Schema URL, for editor completion"),
    extends: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Configs to build on: npm packages or paths. Later ones win, and this file wins over all"),
    harnesses: z
      .partialRecord(HarnessId, z.union([HarnessSettings, z.literal(false)]))
      .optional()
      .describe("Harnesses to test. `false` drops one an inherited config added"),
    backends: z.record(z.string(), Backend).optional().describe('Named backends, like `{ pr: "replay" }`'),
    upstream: z.string().optional().describe("LLM gateway URL real runs go through. CTXRAY_UPSTREAM overrides it"),
    offline: z
      .boolean()
      .optional()
      .describe(
        "Forbid every network request: no installs, no real runs, no exact counts, no calibration. CTXRAY_OFFLINE=1 sets it too",
      ),
    network: Network.optional(),
    concurrency: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Harness sessions an L6 or L7 test runs at once, 1 by default. CTXRAY_CONCURRENCY sets it too"),
    budget: Budget.optional(),
    activate: ActivateDefaults.optional(),
    exactTokens: z
      .boolean()
      .optional()
      .describe("Count captured tokens with the provider's own endpoint, through the upstream and your key"),
    prices: z
      .record(z.string(), Price)
      .optional()
      .describe("Prices by model, over the built-in list of the models ctxray runs by default"),
    ignoreHarnessDifferences: z
      .boolean()
      .optional()
      .describe("Don't warn when the harnesses of a run get different instructions or skills"),
    policies: z.array(Policy).refine(uniqueIds, issue("config.duplicatePolicy")).optional(),
    redact: z.strictObject({ patterns: z.array(RedactPattern).optional() }).optional(),
    limits: Limits.optional(),
    lint: LintConfig.optional(),
    reporters: z.array(Reporter).optional(),
    lang: z.string().optional().describe("CLI language: `auto`, `en`, or `ru`"),
    report: z
      .strictObject({
        langs: z
          .array(z.string())
          .optional()
          .describe("Languages the HTML report carries, the first by default, or `all`. CLI language by default"),
        dir: z
          .string()
          .optional()
          .describe("Where reports go, relative to the project root: .ctxray/report by default"),
      })
      .optional(),
  })
  .describe("ctxray configuration");
export type UserConfigInput = z.input<typeof UserConfig>;
export type UserConfig = z.output<typeof UserConfig>;
