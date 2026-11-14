import type { CommandSpec, Handler } from "../shared/cli/index.ts";
import type { RunInjector } from "./container.ts";

export type Command = {
  readonly spec: CommandSpec;
  readonly handler: (injector: RunInjector) => Handler;
};

export const COMMANDS: readonly Command[] = [];
