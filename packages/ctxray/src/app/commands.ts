import { cacheSpec, createCacheCommand } from "#features/cache/index.ts";
import { calibrateSpec, createCalibrateCommand } from "#features/calibrate/index.ts";
import { createDiffCommand, diffSpec } from "#features/diff/index.ts";
import { createDoctorCommand, doctorSpec } from "#features/doctor/index.ts";
import { createGenPromptsCommand, genPromptsSpec } from "#features/gen-prompts/index.ts";
import { createHarnessCommand, harnessSpec } from "#features/harness-install/index.ts";
import { createInitCommand, initSpec } from "#features/init/index.ts";
import { createInspectCommand, inspectSpec } from "#features/inspect/index.ts";
import { createMcpCommand, mcpSpec } from "#features/mcp-serve/index.ts";
import { createSessionCommand, sessionSpec } from "#features/session/index.ts";
import { createShowConfigCommand, showConfigSpec } from "#features/show-config/index.ts";
import { createShowReportCommand, showReportSpec } from "#features/show-report/index.ts";
import { baselineSpec, createBaselineCommand, createTestCommand, testSpec } from "#features/test-run/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import type { RunInjector } from "./container.ts";

export type Command = {
  readonly spec: CommandSpec;
  readonly handler: (injector: RunInjector) => Handler;
};

export const COMMANDS: readonly Command[] = [
  { spec: inspectSpec, handler: (injector) => injector.injectFunction(createInspectCommand) },
  { spec: testSpec, handler: (injector) => injector.injectFunction(createTestCommand) },
  { spec: baselineSpec, handler: (injector) => injector.injectFunction(createBaselineCommand) },
  { spec: diffSpec, handler: (injector) => injector.injectFunction(createDiffCommand) },
  { spec: showReportSpec, handler: (injector) => injector.injectFunction(createShowReportCommand) },
  { spec: harnessSpec, handler: (injector) => injector.injectFunction(createHarnessCommand) },
  { spec: mcpSpec, handler: (injector) => injector.injectFunction(createMcpCommand) },
  { spec: cacheSpec, handler: (injector) => injector.injectFunction(createCacheCommand) },
  { spec: doctorSpec, handler: (injector) => injector.injectFunction(createDoctorCommand) },
  { spec: genPromptsSpec, handler: (injector) => injector.injectFunction(createGenPromptsCommand) },
  { spec: calibrateSpec, handler: (injector) => injector.injectFunction(createCalibrateCommand) },
  { spec: initSpec, handler: (injector) => injector.injectFunction(createInitCommand) },
  { spec: showConfigSpec, handler: (injector) => injector.injectFunction(createShowConfigCommand) },
  { spec: sessionSpec, handler: (injector) => injector.injectFunction(createSessionCommand) },
];
