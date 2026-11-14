import type { Config } from "../../entities/user-config/index.ts";
import { createRedactor } from "../../shared/redact/index.ts";

export type ShownConfig = { readonly files: readonly string[]; readonly json: string };

// RegExp has no JSON form, so a pattern shows as its literal.
const replacer = (_: string, value: unknown) => (value instanceof RegExp ? String(value) : value);

// A proxy or gateway URL may hold a password, so the config goes through the same redaction as any output.
export const createShowConfigAction = (config: Config) => (): ShownConfig => {
  const { files, ...rest } = config;
  return { files, json: createRedactor().text(JSON.stringify(rest, replacer, 2)) };
};
createShowConfigAction.inject = ["config"] as const;
export type ShowConfigAction = ReturnType<typeof createShowConfigAction>;
