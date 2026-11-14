import type { Backend, HarnessId, HarnessSettings, Network, Policy, UserConfig } from "#shared/contract/index.ts";
import { type Env, isOn } from "#shared/infra/index.ts";

// The config a run works with: every layer merged, defaults filled in, ctxray's env variables applied.
export type Config = {
  readonly files: readonly string[]; // the files that took part, the project's own last
  readonly harnesses: Partial<Record<HarnessId, HarnessSettings>>;
  readonly backends: Readonly<Record<string, Backend>>;
  readonly upstream: string | undefined;
  readonly offline: boolean;
  readonly network: Network;
  // The reach check stays quiet about harnesses that get different instructions. CTXRAY_IGNORE_HARNESS_DIFFERENCES=1.
  readonly ignoreHarnessDifferences: boolean;
  readonly policies: readonly Policy[];
  readonly redact: { readonly patterns: readonly RegExp[] };
  readonly reporters: readonly string[];
  readonly lang: string;
  readonly reportLangs: readonly string[] | undefined;
};

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

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
    ignoreHarnessDifferences:
      isOn(env["CTXRAY_IGNORE_HARNESS_DIFFERENCES"]) || merged.ignoreHarnessDifferences === true,
    policies: merged.policies ?? [],
    redact: { patterns: merged.redact?.patterns ?? [] },
    reporters: merged.reporters ?? ["console"],
    lang: merged.lang ?? "auto",
    reportLangs: merged.report?.langs,
  };
};

export const DEFAULT_CONFIG: Config = finalizeConfig({}, {}, []);
