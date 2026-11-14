import { createInitCommand, initSpec } from "#features/init/index.ts";
import { createInspectCommand, inspectSpec } from "#features/inspect/index.ts";
import { createShowConfigCommand, showConfigSpec } from "#features/show-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import type { RunInjector } from "./container.ts";

export type Command = {
  readonly spec: CommandSpec;
  readonly handler: (injector: RunInjector) => Handler;
};

export const COMMANDS: readonly Command[] = [
  { spec: inspectSpec, handler: (injector) => injector.injectFunction(createInspectCommand) },
  { spec: initSpec, handler: (injector) => injector.injectFunction(createInitCommand) },
  { spec: showConfigSpec, handler: (injector) => injector.injectFunction(createShowConfigCommand) },
];
