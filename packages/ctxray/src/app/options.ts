import type { OptionSpecs } from "#shared/cli/index.ts";

// Every command accepts these.
export const GLOBAL_OPTIONS: OptionSpecs = {
  lang: { type: "string", summary: "option.lang", value: "lang" },
  ci: { type: "boolean", summary: "option.ci" },
  plain: { type: "boolean", summary: "option.plain" },
  "no-color": { type: "boolean", summary: "option.noColor" },
  help: { type: "boolean", short: "h", summary: "option.help" },
  version: { type: "boolean", short: "v", summary: "option.version" },
};
