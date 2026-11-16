import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Renderer, span } from "#shared/render/index.ts";
import { CONTENT_CLASSES } from "#shared/tokens/index.ts";
import { type CalibrateAction, PROVIDERS, type Provider } from "../calibrate.action.ts";

export const calibrateSpec: CommandSpec = {
  name: "calibrate",
  summary: "command.calibrate",
  options: {
    provider: { type: "string", summary: "option.provider", value: Object.keys(PROVIDERS).join("|") },
    model: { type: "string", summary: "option.model", value: "id" },
    out: { type: "string", summary: "option.calibrationOut", value: "file" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const percent = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)} %`;

export const createCalibrateCommand =
  (calibrate: CalibrateAction, t: Translate, renderer: Renderer, config: Config): Handler =>
  async (values) => {
    if (config.offline) {
      renderer.print([[span(t("calibrate.offline"), "failure")]]);
      return ExitCode.environment;
    }
    const provider = values["provider"];
    const model = values["model"];
    if (typeof provider !== "string" || !(provider in PROVIDERS) || typeof model !== "string" || model === "") {
      renderer.print([[span(t("calibrate.usage", { providers: Object.keys(PROVIDERS).join(", ") }), "failure")]]);
      return ExitCode.usage;
    }
    let calibration: Awaited<ReturnType<CalibrateAction>>;
    try {
      calibration = await calibrate({
        provider: provider as Provider,
        model,
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      renderer.print([[span(t("calibrate.failed", { message: (error as Error).message }), "failure")]]);
      return ExitCode.environment;
    }
    if (calibration.status !== "measured") return ExitCode.failed;
    const rows = CONTENT_CLASSES.map((name) => {
      const { factor, low, high, pieces } = calibration.classes[name];
      return [
        span(name, "strong"),
        span(`× ${factor}`),
        span(`${percent(low)} … ${percent(high)}`, "muted"),
        span(t("calibrate.pieces", { count: pieces }), "muted"),
      ];
    });
    renderer.print([
      [span(` ${t("calibrate.title", { provider, model })}`, "strong")],
      ...columns(rows, { indent: 3, gap: 3 }),
      [],
    ]);
    const out = values["out"];
    if (typeof out === "string" && out !== "") {
      await Bun.write(out, `${JSON.stringify(calibration, null, 2)}\n`);
      renderer.print([[span(` ${t("calibrate.written", { file: out })}`, "muted")]]);
    } else {
      renderer.print([[span(JSON.stringify(calibration, null, 2))]]);
    }
    return ExitCode.ok;
  };
createCalibrateCommand.inject = ["calibrateAction", "t", "renderer", "config"] as const;
