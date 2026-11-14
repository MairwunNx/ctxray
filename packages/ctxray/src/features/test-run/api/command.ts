import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import { type Renderer, span, type View } from "#shared/render/index.ts";
import type { Selection } from "../lib/selection.ts";
import type { TestRunAction, TestRunResult } from "../test-run.action.ts";
import { failuresView } from "./failure-view.ts";
import { matrixView } from "./matrix-view.ts";
import { chooseSelection } from "./selection.ts";
import { summaryView } from "./summary-view.ts";
import type { Words } from "./words.ts";

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
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const headerView = (selection: Selection, t: Translate, version: string): View => {
  const { kind, name } = selection.backend;
  const backend = t("test.backend", { backend: name === undefined ? kind : `${kind} (${name})` });
  const parts = [t("count.harnesses", { count: selection.harnesses.length }), backend];
  return [[span(` ctxray ${version}`, "strong"), span(`  ·  ${parts.join("  ·  ")}`, "muted")], []];
};

const failed = (result: TestRunResult) =>
  result.broken.length > 0 || result.results.some((cell) => cell.status === "failed");

export const createTestCommand =
  (testRun: TestRunAction, t: Translate, renderer: Renderer, config: Config, env: Env, version: string): Handler =>
  async (values) => {
    const selection = chooseSelection(values, env, config);
    if ("key" in selection) {
      renderer.print([[span(t(selection.key, selection.params), "failure")]]);
      return ExitCode.usage;
    }
    renderer.print(headerView(selection, t, version));
    const result = await testRun(
      {
        selection,
        updateSnapshots: values["update-snapshots"] === true,
        differences: values["ignore-harness-differences"] !== true && !config.ignoreHarnessDifferences,
        errorOnWarnings: values["error-on-warnings"] === true,
      },
      (done, total, current) =>
        renderer.live(
          current === undefined
            ? undefined
            : [[span(` ${t("test.progress", { done, total })}  `), span(current, "muted")]],
        ),
    );
    // Failures quote the user's files and values, so they pass the same redaction as any other output.
    const redactor = createRedactor(config.redact.patterns);
    const words: Words = {
      t: (key, params) => redactor.text(t(key, params)),
      clean: (text) => redactor.text(text),
      cwd: result.cwd,
    };
    renderer.print([
      ...matrixView(result.results, words),
      ...failuresView(result, words),
      ...summaryView(result, words, version),
    ]);
    return failed(result) ? ExitCode.failed : ExitCode.ok;
  };
createTestCommand.inject = ["testRunAction", "t", "renderer", "config", "env", "version"] as const;
