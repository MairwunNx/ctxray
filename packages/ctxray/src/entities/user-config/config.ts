import {
  type Backend,
  type Budget,
  type HarnessId,
  type HarnessSettings,
  type LimitsInput,
  type LintConfig,
  type Network,
  type Policy,
  type Price,
  type ResolvedLimits,
  resolveLimits,
  type UserConfig,
} from "#shared/contract/index.ts";
import { type Env, isOn } from "#shared/infra/index.ts";

// The config a run works with: every layer merged, defaults filled in, ctxray's env variables applied.
export type Config = {
  readonly files: readonly string[]; // the files that took part, the project's own last
  readonly harnesses: Partial<Record<HarnessId, HarnessSettings>>;
  readonly backends: Readonly<Record<string, Backend>>;
  readonly upstream: string | undefined;
  readonly offline: boolean;
  readonly network: Network;
  readonly budget: Budget; // CTXRAY_BUDGET_USD sets the dollars
  readonly prices: Readonly<Record<string, Price>>;
  readonly exactTokens: boolean; // CTXRAY_EXACT_TOKENS=1
  // The reach check stays quiet about harnesses that get different instructions. CTXRAY_IGNORE_HARNESS_DIFFERENCES=1.
  readonly ignoreHarnessDifferences: boolean;
  readonly policies: readonly Policy[];
  readonly redact: { readonly patterns: readonly RegExp[] };
  readonly limits: ResolvedLimits;
  readonly limitsInput: LimitsInput | undefined; // as written, for lint overrides to build on
  readonly lint: LintConfig;
  readonly reporters: readonly string[] | undefined; // as the config lists them: CI picks its own otherwise
  readonly lang: string;
  readonly reportLangs: readonly string[] | undefined;
  readonly reportDir: string; // relative to the project root
};

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

const dollars = (value: string | undefined) => {
  const parsed = Number(present(value));
  return Number.isFinite(parsed) && parsed >= 0 && present(value) !== undefined ? parsed : undefined;
};

// ctxray's own variables beat the config file: CI sets them per job, the file is shared by all jobs.
export const finalizeConfig = (merged: UserConfig, env: Env, files: readonly string[]): Config => {
  const harnesses: Partial<Record<HarnessId, HarnessSettings>> = {};
  for (const [id, settings] of Object.entries(merged.harnesses ?? {})) {
    if (settings) harnesses[id as HarnessId] = settings;
  }
  return {
    files,
    harnesses,
    backends: merged.backends ?? {},
    upstream: present(env["CTXRAY_UPSTREAM"]) ?? merged.upstream,
    offline: isOn(env["CTXRAY_OFFLINE"]) || merged.offline === true,
    network: merged.network ?? {},
    budget: {
      ...merged.budget,
      ...(dollars(env["CTXRAY_BUDGET_USD"]) !== undefined && { usd: dollars(env["CTXRAY_BUDGET_USD"]) }),
    },
    prices: merged.prices ?? {},
    exactTokens: isOn(env["CTXRAY_EXACT_TOKENS"]) || merged.exactTokens === true,
    ignoreHarnessDifferences:
      isOn(env["CTXRAY_IGNORE_HARNESS_DIFFERENCES"]) || merged.ignoreHarnessDifferences === true,
    policies: merged.policies ?? [],
    redact: { patterns: merged.redact?.patterns ?? [] },
    limits: resolveLimits(merged.limits),
    limitsInput: merged.limits,
    lint: merged.lint ?? {},
    reporters: merged.reporters,
    lang: merged.lang ?? "auto",
    reportLangs: merged.report?.langs,
    reportDir: merged.report?.dir ?? ".ctxray/report",
  };
};

export const DEFAULT_CONFIG: Config = finalizeConfig({}, {}, []);
