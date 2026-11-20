import { UnknownRevision } from "#entities/harness/index.ts";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { TestRunAction, TestRunRequest } from "../test-run.action.ts";
import { chooseReporting } from "./reporting.ts";
import { failed, runOnce } from "./run-once.ts";
import { chooseSelection } from "./selection.ts";
import { nextRun } from "./watch.ts";

export const testSpec: CommandSpec = {
  name: "test",
  summary: "command.test",
  options: {
    harness: { type: "string", summary: "option.harness", value: "ids" },
    backend: { type: "string", summary: "option.backend", value: "name" },
    layer: { type: "string", summary: "option.layer", value: "layers" },
    filter: { type: "string", summary: "option.filter", value: "text" },
    "update-snapshots": { type: "boolean", short: "u", summary: "option.updateSnapshots" },
    "ignore-harness-differences": { type: "boolean", summary: "option.ignoreHarnessDifferences" },
    "error-on-warnings": { type: "boolean", summary: "option.errorOnWarnings" },
    frozen: { type: "boolean", summary: "option.frozen" },
    "no-install": { type: "boolean", summary: "option.noInstall" },
    record: { type: "boolean", summary: "option.record" },
    base: { type: "string", summary: "option.base", value: "ref" },
    reporter: { type: "string", summary: "option.reporter", value: "names" },
    "report-lang": { type: "string", summary: "option.reportLang", value: "langs" },
    "report-dir": { type: "string", summary: "option.reportDir", value: "dir" },
    budget: { type: "string", summary: "option.budget", value: "usd" },
    concurrency: { type: "string", summary: "option.concurrency", value: "count" },
    watch: { type: "boolean", short: "w", summary: "option.watch" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

export type RunSettings = { readonly lang: string; readonly ci: boolean };

export const createTestCommand =
  (
    testRun: TestRunAction,
    t: Translate,
    renderer: Renderer,
    config: Config,
    env: Env,
    version: string,
    settings: RunSettings,
  ): Handler =>
  async (values) => {
    const selection = chooseSelection(values, env, config);
    const reporting = chooseReporting(values, env, config, settings.ci, settings.lang);
    const budget = typeof values["budget"] === "string" ? Number(values["budget"]) : undefined;
    const concurrency = typeof values["concurrency"] === "string" ? Number(values["concurrency"]) : undefined;
    for (const chosen of [selection, reporting]) {
      if ("key" in chosen) renderer.print([[span(t(chosen.key, chosen.params), "failure")]]);
    }
    if ("key" in selection || "key" in reporting) return ExitCode.usage;
    if (selection.backend.kind === "real" && config.offline) {
      renderer.print([[span(t("test.offline"), "failure")]]);
      return ExitCode.environment;
    }
    if (budget !== undefined && !(Number.isFinite(budget) && budget >= 0)) {
      renderer.print([[span(t("test.badBudget", { value: String(values["budget"]) }), "failure")]]);
      return ExitCode.usage;
    }
    if (concurrency !== undefined && !(Number.isInteger(concurrency) && concurrency > 0)) {
      renderer.print([[span(t("test.badConcurrency", { value: String(values["concurrency"]) }), "failure")]]);
      return ExitCode.usage;
    }
    const request: TestRunRequest = {
      selection,
      updateSnapshots: values["update-snapshots"] === true,
      differences: values["ignore-harness-differences"] !== true && !config.ignoreHarnessDifferences,
      errorOnWarnings: values["error-on-warnings"] === true,
      frozen: values["frozen"] === true,
      install: values["no-install"] !== true,
      record: values["record"] === true,
      ...(typeof values["base"] === "string" && values["base"] !== "" && { base: values["base"] }),
      ...(budget !== undefined && { budget }),
      ...(concurrency !== undefined && { concurrency }),
    };
    const deps = { testRun, t, renderer, config, env, version, lang: settings.lang };
    let result: Awaited<ReturnType<typeof runOnce>>;
    try {
      result = await runOnce(deps, request, reporting);
    } catch (error) {
      if (!(error instanceof UnknownRevision)) throw error;
      renderer.print([[span(t("diff.unknownBase", { ref: request.base ?? "" }), "failure")]]);
      return ExitCode.usage;
    }
    // --watch: run again after each change until q or Ctrl+C. The exit code is the last run's.
    while (values["watch"] === true && (await nextRun(result.root, reporting.dir, renderer, t)) !== "quit") {
      result = await runOnce(deps, request, reporting);
    }
    return failed(result) ? ExitCode.failed : ExitCode.ok;
  };
createTestCommand.inject = ["testRunAction", "t", "renderer", "config", "env", "version", "settings"] as const;
