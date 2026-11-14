import type { ExitCode } from "../contract/index.ts";
import type { MessageKey } from "../i18n/index.ts";

export type OptionSpec = {
  readonly type: "boolean" | "string";
  readonly short?: string;
  readonly summary: MessageKey;
  readonly value?: string; // shown in help: `--lang <en|ru>`
};
export type OptionSpecs = Readonly<Record<string, OptionSpec>>;
export type Values = Readonly<Record<string, string | boolean | undefined>>;

export type CommandSpec = {
  readonly name: string;
  readonly summary: MessageKey;
  readonly options: OptionSpecs;
  readonly usesConfig?: boolean; // the CLI loads the config before the command runs, and stops on its errors
};

export type Handler = (values: Values) => Promise<ExitCode>;
