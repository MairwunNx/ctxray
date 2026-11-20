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

const OAUTH_BETA = "oauth-2025-04-20";

// Where ctxray looks for a protocol's key, in the order credentialsFor() reads them. Names only, never values.
export const keyVariables = (protocol: Protocol): string[] => [
  "CTXRAY_UPSTREAM_KEY",
  KEYS[protocol].variable,
  ...(protocol === "anthropic" ? ["CLAUDE_CODE_OAUTH_TOKEN"] : []),
];

// Every variable a key for some protocol can come from.
export const KEY_VARIABLES = [
  ...new Set((Object.keys(KEYS) as Protocol[]).flatMap((protocol) => keyVariables(protocol))),
];

// The real key for a protocol, from ctxray's environment: CTXRAY_UPSTREAM_KEY for a gateway in front of every
// provider, or the provider's own variable. Without an Anthropic key, a Claude Code login token from
// `claude setup-token` goes as a bearer with the OAuth beta next to the harness's own betas. No key, no
// header: the upstream answers 401 in its own words.
export const credentialsFor = (protocol: Protocol, env: Env, betas?: string | null): Record<string, string> => {
  const { variable, header, bearer } = KEYS[protocol];
  const key = env["CTXRAY_UPSTREAM_KEY"] || env[variable];
  const oauth = env["CLAUDE_CODE_OAUTH_TOKEN"];
  if (!key && protocol === "anthropic" && oauth) {
    const listed = (betas ?? "").split(",").map((beta) => beta.trim());
    const merged = [...new Set([...listed, OAUTH_BETA])].filter((beta) => beta !== "").join(",");
    return { authorization: `Bearer ${oauth}`, "anthropic-beta": merged };
  }
  if (!key) return {};
  return { [header]: bearer ? `Bearer ${key}` : key };
};
