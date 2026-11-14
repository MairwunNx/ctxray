import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Renderer } from "#shared/render/index.ts";
import type { ShowConfigAction } from "../show-config.action.ts";
import { showConfigView } from "./view.ts";

export const showConfigSpec: CommandSpec = {
  name: "config",
  summary: "command.config",
  options: { config: CONFIG_OPTION },
  usesConfig: true,
};

export const createShowConfigCommand =
  (show: ShowConfigAction, t: Translate, renderer: Renderer): Handler =>
  async () => {
    renderer.print(showConfigView(show(), t));
    return ExitCode.ok;
  };
createShowConfigCommand.inject = ["showConfigAction", "t", "renderer"] as const;
