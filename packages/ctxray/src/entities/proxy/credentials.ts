import type { Env } from "#shared/infra/index.ts";
import type { Protocol } from "./model.ts";

// Every header a harness may carry its key in. The harness only ever holds ctxray's dummy key (TASK §6.4), so
// the proxy drops them all and puts the real key in on the way out.
export const CREDENTIAL_HEADERS = ["authorization", "x-api-key", "x-goog-api-key", "api-key"];

const KEYS: Record<Protocol, { variable: string; header: string; bearer: boolean }> = {
  anthropic: { variable: "ANTHROPIC_API_KEY", header: "x-api-key", bearer: false },
  responses: { variable: "OPENAI_API_KEY", header: "authorization", bearer: true },
  chat: { variable: "OPENAI_API_KEY", header: "authorization", bearer: true },
  gemini: { variable: "GEMINI_API_KEY", header: "x-goog-api-key", bearer: false },
};

// The real key for a protocol, from ctxray's environment: CTXRAY_UPSTREAM_KEY for a gateway in front of every
// provider, or the provider's own variable. No key, no header: the upstream answers 401 in its own words.
export const credentialsFor = (protocol: Protocol, env: Env): Record<string, string> => {
  const { variable, header, bearer } = KEYS[protocol];
  const key = env["CTXRAY_UPSTREAM_KEY"] || env[variable];
  if (!key) return {};
  return { [header]: bearer ? `Bearer ${key}` : key };
};
