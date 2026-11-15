import { progressView } from "#entities/harness-cache/index.ts";
import type { Config } from "#entities/user-config/index.ts";
import type { Report } from "#shared/contract/index.ts";
import { createTranslator, type Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import { type Renderer, span, type View } from "#shared/render/index.ts";
import { buildReport } from "../lib/report.ts";
import type { Selection } from "../lib/selection.ts";
import { type Reporting, writeReports } from "../lib/write-reports.ts";
import type { TestRunAction, TestRunRequest, TestRunResult } from "../test-run.action.ts";
import { failuresView } from "./failure-view.ts";
import { matrixView } from "./matrix-view.ts";
import { summaryView } from "./summary-view.ts";
import type { Words } from "./words.ts";

export type RunDeps = {
  testRun: TestRunAction;
  t: Translate;
  renderer: Renderer;
  config: Config;
  env: Env;
  version: string;
  lang: string;
};

const headerView = (selection: Selection, t: Translate, version: string): View => {
  const { kind, name } = selection.backend;
  const backend = t("test.backend", { backend: name === undefined ? kind : `${kind} (${name})` });
  const parts = [t("count.harnesses", { count: selection.harnesses.length }), backend];
  return [[span(` ctxray ${version}`, "strong"), span(`  ·  ${parts.join("  ·  ")}`, "muted")], []];
};

export const failed = (result: TestRunResult) =>
  result.broken.length > 0 || result.results.some((cell) => cell.status === "failed");

// One run: the tests, the reports, and what the terminal shows. Every text the user's files fill in passes
// redaction first, the report on disk as much as the console.
export const runOnce = async (
  { testRun, t, renderer, config, env, version, lang }: RunDeps,
  request: TestRunRequest,
  reporting: Reporting,
) => {
  renderer.print(headerView(request.selection, t, version));
  const result = await testRun(
    request,
    (done, total, current) =>
      renderer.live(
        current === undefined
          ? undefined
          : [[span(` ${t("test.progress", { done, total })}  `), span(current, "muted")]],
      ),
    (harness, progress) => renderer.live(progressView(harness, progress, t)),
  );
  const redactor = createRedactor(config.redact.patterns);
  const words: Words = {
    t: (key, params) => redactor.text(t(key, params)),
    clean: (text) => redactor.text(text),
    cwd: result.cwd,
  };
  const reportT = createTranslator(reporting.langs[0] ?? lang);
  const report = redactor.value(
    buildReport(result, { version, langs: reporting.langs, t: reportT, now: new Date() }),
  ) as Report;
  const written = await writeReports(report, reporting, result.root, env, reportT);
  renderer.print([
    ...(reporting.reporters.has("console")
      ? [...matrixView(result.results, words), ...failuresView(result, words)]
      : []),
    ...summaryView(result, words, version, written),
  ]);
  return result;
};
