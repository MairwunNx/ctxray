import type { CommandSpec, Handler } from "../../../shared/cli/index.ts";
import { ExitCode } from "../../../shared/contract/index.ts";
import type { Translate } from "../../../shared/i18n/index.ts";
import type { Renderer } from "../../../shared/render/index.ts";
import type { InitAction } from "../init.action.ts";
import { initView } from "./view.ts";

export const initSpec: CommandSpec = {
  name: "init",
  summary: "command.init",
  options: { force: { type: "boolean", summary: "option.force" } },
};

export const createInitCommand =
  (init: InitAction, t: Translate, renderer: Renderer): Handler =>
  async (values) => {
    renderer.print(initView(await init({ force: values["force"] === true }), t));
    return ExitCode.ok;
  };
createInitCommand.inject = ["initAction", "t", "renderer"] as const;
