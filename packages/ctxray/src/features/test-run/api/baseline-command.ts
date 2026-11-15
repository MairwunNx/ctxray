import { DEFAULT_HARNESSES } from "#entities/harness/index.ts";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { BaselineAction } from "../baseline.action.ts";

export const baselineSpec: CommandSpec = {
  name: "baseline",
  summary: "command.baseline",
  options: { harness: { type: "string", summary: "option.harness", value: "ids" }, config: CONFIG_OPTION },
  usesConfig: true,
};

export const createBaselineCommand =
  (baseline: BaselineAction, t: Translate, renderer: Renderer, config: Config): Handler =>
  async (values) => {
    const asked =
      typeof values["harness"] === "string" ? values["harness"].split(",").map((id) => id.trim()) : undefined;
    const configured = Object.keys(config.harnesses);
    const harnesses = (asked ?? (configured.length > 0 ? configured : DEFAULT_HARNESSES)).filter(
      (id): id is HarnessId => HarnessId.safeParse(id).success,
    );
    const { file, count } = await baseline(harnesses);
    renderer.print([
      [span(` ${t("baseline.written", { count, file })}`, "success")],
      [span(` ${t("baseline.hint")}`, "muted")],
    ]);
    return ExitCode.ok;
  };
createBaselineCommand.inject = ["baselineAction", "t", "renderer", "config"] as const;
