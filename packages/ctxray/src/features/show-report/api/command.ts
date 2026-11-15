import { resolve } from "node:path";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import { NoReport, type ShowReportAction } from "../show-report.action.ts";

export const showReportSpec: CommandSpec = {
  name: "show-report",
  summary: "command.showReport",
  options: {
    "report-dir": { type: "string", summary: "option.reportDir", value: "dir" },
    port: { type: "string", summary: "option.port", value: "port" },
    open: { type: "boolean", summary: "option.open" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const OPENERS: Record<string, string[]> = { darwin: ["open"], win32: ["cmd", "/c", "start", ""] };

export const createShowReportCommand =
  (show: ShowReportAction, t: Translate, renderer: Renderer, config: Config, cwd: string): Handler =>
  async (values) => {
    const dir = resolve(cwd, typeof values["report-dir"] === "string" ? values["report-dir"] : config.reportDir);
    const port = Number(values["port"] ?? 0);
    let shown: Awaited<ReturnType<ShowReportAction>>;
    try {
      shown = await show(dir, Number.isInteger(port) && port >= 0 ? port : 0);
    } catch (error) {
      if (!(error instanceof NoReport)) throw error;
      renderer.print([[span(t("showReport.none", { dir }), "failure")]]);
      return ExitCode.usage;
    }
    renderer.print([
      [span(` ${t("showReport.serving")}  `), span(shown.url, "accent")],
      [span(` ${t("showReport.live")}`, "muted")],
    ]);
    if (values["open"] === true) Bun.spawn([...(OPENERS[process.platform] ?? ["xdg-open"]), shown.url]);
    // Until Ctrl+C: the page reloads after each run.
    await new Promise<void>((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
    });
    await shown.stop();
    return ExitCode.ok;
  };
createShowReportCommand.inject = ["showReportAction", "t", "renderer", "config", "cwd"] as const;
