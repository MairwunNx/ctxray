import { createInjector } from "typed-inject";
import { type Config, createConfigLoader } from "#entities/user-config/index.ts";
import { createCacheAction } from "#features/cache/index.ts";
import { createDoctorAction } from "#features/doctor/index.ts";
import {
  createHarnessAddAction,
  createHarnessInstallAction,
  createHarnessListAction,
  createHarnessPackAction,
  createHarnessUpgradeAction,
} from "#features/harness-install/index.ts";
import { createInitAction } from "#features/init/index.ts";
import { createInspectAction } from "#features/inspect/index.ts";
import { createShowConfigAction } from "#features/show-config/index.ts";
import { createStartingLoadout, createTestRunAction } from "#features/test-run/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import type { Renderer } from "#shared/render/index.ts";
import { VERSION } from "./package-info.ts";
import { SELF } from "./self.ts";
import type { Settings } from "./settings.ts";

export const createContainer = (env: Env, cwd: string) =>
  createInjector()
    .provideValue("env", env)
    .provideValue("cwd", cwd)
    .provideValue("version", VERSION)
    .provideValue("self", SELF)
    .provideFactory("configLoader", createConfigLoader)
    .provideFactory("initAction", createInitAction);
export type Container = ReturnType<typeof createContainer>;

// One child injector per run: what the flags and the config decided lives in it and goes away with it.
export const createRunInjector = (
  container: Container,
  settings: Settings,
  t: Translate,
  renderer: Renderer,
  config: Config,
) =>
  container
    .provideValue("settings", settings)
    .provideValue("t", t)
    .provideValue("renderer", renderer)
    .provideValue("config", config)
    .provideFactory("showConfigAction", createShowConfigAction)
    .provideFactory("inspectAction", createInspectAction)
    .provideFactory("testRunAction", createTestRunAction)
    .provideFactory("harnessAddAction", createHarnessAddAction)
    .provideFactory("harnessInstallAction", createHarnessInstallAction)
    .provideFactory("harnessListAction", createHarnessListAction)
    .provideFactory("harnessPackAction", createHarnessPackAction)
    .provideFactory("startingLoadout", createStartingLoadout)
    .provideFactory("harnessUpgradeAction", createHarnessUpgradeAction)
    .provideFactory("cacheAction", createCacheAction)
    .provideFactory("doctorAction", createDoctorAction);
export type RunInjector = ReturnType<typeof createRunInjector>;
