import type { Env } from "#shared/infra/index.ts";
import type { Config } from "./config.ts";

export type NetworkSettings = {
  readonly httpsProxy: string | undefined;
  readonly httpProxy: string | undefined;
  readonly noProxy: readonly string[];
  readonly caFiles: readonly string[];
  readonly systemCa: boolean;
  readonly offline: boolean;
};

const present = (value: string | undefined) => (value === undefined || value === "" ? undefined : value);

// Lower case first, as Bun reads them (ADR 0003).
const variable = (env: Env, name: string) => present(env[name.toLowerCase()]) ?? present(env[name]);

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

// The config beats the machine-wide variables: it's written for ctxray, they're written for everything.
export const resolveNetwork = (config: Config, env: Env): NetworkSettings => {
  const { proxy, noProxy, ca, systemCa } = config.network;
  const extraCa = present(env["NODE_EXTRA_CA_CERTS"]);
  return {
    httpsProxy: proxy ?? variable(env, "HTTPS_PROXY"),
    httpProxy: proxy ?? variable(env, "HTTP_PROXY"),
    noProxy: noProxy ?? list(variable(env, "NO_PROXY")),
    caFiles: [...(ca ?? []), ...(extraCa ? [extraCa] : [])],
    systemCa: systemCa ?? env["NODE_USE_SYSTEM_CA"] === "1",
    offline: config.offline,
  };
};
