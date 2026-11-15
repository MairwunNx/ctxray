import { createExactCounter, memoryCountCache, type Protocol } from "#entities/proxy/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { type Calibration, CORPUS, countTokens, factorsOf } from "#shared/tokens/index.ts";

export const PROVIDERS = { anthropic: "anthropic", openai: "responses", google: "gemini" } as const;
export type Provider = keyof typeof PROVIDERS;

export type CalibrateRequest = { provider: Provider; model: string; date: string };

// Counts every corpus piece the provider's way, as the baseline with the piece minus the baseline, and
// sets the result against o200k (ADR 0012, step 7). Free on Anthropic and Google, about 40 requests.
export const createCalibrateAction =
  (config: Config, env: Env, version: string) =>
  async ({ provider, model, date }: CalibrateRequest): Promise<Calibration> => {
    const protocol: Protocol = PROVIDERS[provider];
    const counter = createExactCounter({
      upstream: config.upstream,
      egress: await egressOf(resolveNetwork(config, env)),
      env,
      cache: memoryCountCache(),
    });
    const endpoint = counter.endpoint(protocol);
    if (!endpoint) throw new Error(`${protocol} has no count endpoint`);
    const minimal = endpoint.minimal(model);
    const baseline = await counter.count(protocol, model, minimal);
    const measured = [];
    for (const piece of CORPUS) {
      const exact = (await counter.count(protocol, model, endpoint.withSystem(minimal, piece.text))) - baseline;
      measured.push({ class: piece.class, local: countTokens(piece.text), exact });
    }
    return { status: "measured", provider, model, date, ctxray: version, classes: factorsOf(measured) };
  };
createCalibrateAction.inject = ["config", "env", "version"] as const;
export type CalibrateAction = ReturnType<typeof createCalibrateAction>;
