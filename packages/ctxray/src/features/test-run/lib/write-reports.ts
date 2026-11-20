import { appendFile, mkdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { toAllure, toHtml, toJunit, toMarkdown } from "#entities/report/index.ts";
import type { Report, Reporter } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";

export type ReporterName = (typeof Reporter.options)[number];
export type Reporting = { reporters: ReadonlySet<ReporterName>; langs: readonly string[]; dir: string };

export type Written = { dir: string; html: string | undefined; files: readonly string[] };

// Every file reporter of the run into the report folder, the old allure-results replaced. Redaction ran
// before: the report holds what the console showed. A GitHub job gets the Markdown as its summary too.
export const writeReports = async (
  report: Report,
  { reporters, dir }: Reporting,
  root: string,
  env: Env,
  t: Translate,
): Promise<Written> => {
  // `--report-dir /tmp/out` is a folder of its own, not one under the project.
  const folder = resolve(root, dir);
  const files: string[] = [];
  const write = async (name: string, text: string) => {
    const path = join(folder, name);
    await Bun.write(path, text);
    files.push(relative(root, path));
  };
  if (reporters.size === 0 || (reporters.size === 1 && reporters.has("console")))
    return { dir, html: undefined, files };
  await mkdir(folder, { recursive: true });
  const label = (key: string) => t(key as Parameters<Translate>[0]);
  // The HTML report keeps its data beside it: show-report serves from it, and a reader without scripts gets it.
  if (reporters.has("json") || reporters.has("html"))
    await write("report.json", `${JSON.stringify(report, null, 2)}\n`);
  if (reporters.has("junit")) await write("junit.xml", toJunit(report, label));
  if (reporters.has("allure")) {
    await rm(join(folder, "allure-results"), { recursive: true, force: true });
    for (const [name, text] of Object.entries(toAllure(report, label))) await write(join("allure-results", name), text);
  }
  const html = reporters.has("html") ? join(dir, "index.html") : undefined;
  if (html) await write("index.html", await toHtml(report));
  if (reporters.has("markdown")) {
    const markdown = toMarkdown(report, t, html);
    await write("summary.md", markdown);
    const summary = env["GITHUB_STEP_SUMMARY"];
    if (summary) await appendFile(summary, `${markdown}\n`);
  }
  return { dir, html, files };
};
