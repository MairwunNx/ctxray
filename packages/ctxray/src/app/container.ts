import { createInjector } from "typed-inject";
import { createInitAction } from "../features/init/index.ts";
import type { Translate } from "../shared/i18n/index.ts";
import type { Env } from "../shared/infra/index.ts";
import type { Renderer } from "../shared/render/index.ts";
import type { Settings } from "./settings.ts";

export const createContainer = (env: Env, cwd: string) =>
  createInjector().provideValue("env", env).provideValue("cwd", cwd).provideFactory("initAction", createInitAction);
export type Container = ReturnType<typeof createContainer>;

// One child injector per run: what the flags decided lives in it and goes away with it.
export const createRunInjector = (container: Container, settings: Settings, t: Translate, renderer: Renderer) =>
  container.provideValue("settings", settings).provideValue("t", t).provideValue("renderer", renderer);
export type RunInjector = ReturnType<typeof createRunInjector>;
