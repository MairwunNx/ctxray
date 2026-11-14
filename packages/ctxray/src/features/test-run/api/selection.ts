import { DEFAULT_HARNESSES } from "#entities/harness/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { Values } from "#shared/cli/index.ts";
import { Backend, HarnessId } from "#shared/contract/index.ts";
import type { MessageKey, Params } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { LAYERS, parseLayers, type Selection } from "../lib/selection.ts";

export type SelectionError = { key: MessageKey; params: Params };

const text = (value: Values[string] | undefined) => (typeof value === "string" && value !== "" ? value : undefined);

const listOf = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

// A flag beats CTXRAY_* in the environment, which beats the config.
export const chooseSelection = (values: Values, env: Env, config: Config): Selection | SelectionError => {
  const asked = text(values["harness"]) ?? text(env["CTXRAY_HARNESS"]);
  const ids = asked === undefined ? undefined : listOf(asked);
  const unknown = ids?.find((id) => !HarnessId.safeParse(id).success);
  if (unknown !== undefined) {
    return { key: "error.unknownHarness", params: { name: unknown, known: HarnessId.options.join(", ") } };
  }
  const configured = Object.keys(config.harnesses) as HarnessId[];
  const harnesses = (ids as HarnessId[] | undefined) ?? (configured.length > 0 ? configured : DEFAULT_HARNESSES);

  // A backend is a kind, or a name the config gave one: `--backend pr` with `backends: { pr: "replay" }`.
  const name = text(values["backend"]) ?? text(env["CTXRAY_BACKEND"]) ?? "mock";
  const kind = Backend.safeParse(name).success ? (name as Backend) : config.backends[name];
  if (kind === undefined) {
    const known = [...Backend.options, ...Object.keys(config.backends)].join(", ");
    return { key: "test.unknownBackend", params: { name, known } };
  }

  const layerText = text(values["layer"]) ?? text(env["CTXRAY_LAYER"]);
  const layers = layerText === undefined ? new Set(LAYERS) : parseLayers(layerText);
  if (!layers) return { key: "test.badLayer", params: { value: layerText ?? "" } };

  const experimental = configured.filter((id) => config.harnesses[id]?.experimental === true);
  return {
    harnesses: [...new Set(harnesses)],
    experimental: new Set(experimental),
    backend: { kind, name: kind === name ? undefined : name },
    layers,
    filter: text(values["filter"]),
  };
};
