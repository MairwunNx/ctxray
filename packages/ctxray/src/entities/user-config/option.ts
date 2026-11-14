import type { OptionSpec } from "#shared/cli/index.ts";

// Every command that reads the config takes this flag.
export const CONFIG_OPTION: OptionSpec = { type: "string", summary: "option.config", value: "file" };
