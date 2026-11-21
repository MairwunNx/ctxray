import { UnknownRevision } from "#entities/harness/index.ts";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler, Values } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import { CATALOGS, type Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { DiffAction, DiffResult } from "../diff.action.ts";
import { type DiffFileAction, SavedReportProblem } from "../diff-file.action.ts";
import type { DiffReportAction } from "../diff-report.action.ts";
import { diffView } from "./view.ts";

export const diffSpec: CommandSpec = {
  name: "diff",
  summary: "command.diff",
  options: {
    base: { type: "string", summary: "option.base", value: "ref" },
    file: { type: "string", summary: "option.diffFile", value: "report.json" },
    harness: { type: "string", summary: "option.harness", value: "ids" },
    json: { type: "boolean", summary: "option.json" },
    "report-dir": { type: "string", summary: "option.reportDir", value: "dir" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const text = (value: Values[string]) => (typeof value === "string" && value !== "" ? value : undefined);
// `2026-11-20 17:53 UTC`: when the saved report's run happened, the same for every reader.
const when = (iso: string | undefined) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "");

export const createDiffCommand =
  (
    diff: DiffAction,
    diffFile: DiffFileAction,
    diffReport: DiffReportAction,
    t: Translate,
    renderer: Renderer,
    config: Config,
    settings: { readonly lang: string },
  ): Handler =>
  async (values) => {
    const fail = (message: string) => {
      renderer.print([[span(message, "failure")]]);
      return ExitCode.usage;
    };
    const file = text(values["file"]);
    if (file !== undefined && text(values["base"]) !== undefined) return fail(t("diff.baseOrFile"));
    const base = text(values["base"]) ?? "origin/master";
    const asked = text(values["harness"])
      ?.split(",")
      .map((id) => id.trim());
    const harnesses = asked?.filter((id): id is HarnessId => HarnessId.safeParse(id).success);
    let result: DiffResult;
    try {
      result = file === undefined ? await diff({ base, harnesses }) : await diffFile({ file, harnesses });
    } catch (error) {
      if (error instanceof UnknownRevision) return fail(t("diff.unknownBase", { ref: base }));
      if (error instanceof SavedReportProblem) return fail(t(error.key, error.params));
      throw error;
    }
    const ref =
      file === undefined ? `${base} (${result.commit?.slice(0, 8)})` : `${result.base}, ${when(result.createdAt)}`;
    const langs = (config.reportLangs ?? [settings.lang]).filter((lang) => lang in CATALOGS);
    const written = await diffReport(result, ref, text(values["report-dir"]) ?? config.reportDir, langs);
    if (values["json"] === true) {
      renderer.print([[span(JSON.stringify(result, null, 2))]]);
      return ExitCode.ok;
    }
    const title =
      file === undefined
        ? t("diff.title", { ref: base, commit: result.commit?.slice(0, 8) ?? "" })
        : t("diff.titleFile", { file: result.base, date: when(result.createdAt) });
    renderer.print([
      [span(` ${title}`, "strong")],
      [],
      ...diffView(result, t),
      ...(result.missing ?? []).map((harness) => [
        span(` ! ${t("diff.noSavedLoadout", { file: result.base, harness })}`, "warning"),
      ]),
      ...((result.missing?.length ?? 0) > 0 ? [[]] : []),
      [span(` ${t("diff.written", written)}`, "muted")],
    ]);
    return ExitCode.ok;
  };
createDiffCommand.inject = [
  "diffAction",
  "diffFileAction",
  "diffReportAction",
  "t",
  "renderer",
  "config",
  "settings",
] as const;
