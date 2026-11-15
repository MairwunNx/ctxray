import { type Egress, type Env, fetchThrough } from "#shared/infra/index.ts";
import { credentialsFor } from "../credentials.ts";
import { PROVIDERS } from "../forward.ts";
import type { Json, Protocol } from "../model.ts";
import type { CountCache } from "./cache.ts";
import { ENDPOINTS, type Endpoint } from "./endpoints.ts";

// Bumped when ctxray changes what it sends to count, so old cache entries stop matching.
const METHOD_VERSION = 1;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Json)[key])]),
  );
};

export type ExactCounter = {
  endpoint: (protocol: Protocol) => Endpoint | undefined;
  count: (protocol: Protocol, model: string, body: Json) => Promise<number>;
};

export type CounterDeps = { upstream: string | undefined; egress: Egress; env: Env; cache: CountCache };

export class CountFailure extends Error {}

// Asks the provider, through the user's upstream and network, and remembers the answer by its hash.
export const createExactCounter = ({ upstream, egress, env, cache }: CounterDeps): ExactCounter => ({
  endpoint: (protocol) => ENDPOINTS[protocol],
  count: async (protocol, model, body) => {
    const endpoint = ENDPOINTS[protocol];
    if (!endpoint) throw new CountFailure(`${protocol} has no count endpoint`);
    const request = endpoint.request(body, model);
    const key = new Bun.CryptoHasher("sha256")
      .update(JSON.stringify([protocol, model, endpoint.method, METHOD_VERSION, canonical(request)]))
      .digest("hex");
    const known = cache.get(key);
    if (known !== undefined) return known;
    const base = (upstream ?? PROVIDERS[protocol]).replace(/\/$/, "");
    const response = await fetchThrough(
      new URL(`${base}${endpoint.path(model)}`),
      {
        method: "POST",
        headers: { "content-type": "application/json", ...endpoint.headers, ...credentialsFor(protocol, env) },
        body: JSON.stringify(request),
      },
      egress,
    );
    const answer = (await response.json().catch(() => ({}))) as Json;
    const tokens = response.ok ? endpoint.read(answer) : undefined;
    if (tokens === undefined) {
      const message = (answer["error"] as Json | undefined)?.["message"];
      throw new CountFailure(`${response.status} ${typeof message === "string" ? message : response.statusText}`);
    }
    cache.set(key, tokens);
    return tokens;
  },
});
