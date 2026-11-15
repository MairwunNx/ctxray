import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPORT } from "#entities/report/report.fixture.ts";
import { createShowReportAction, NoReport } from "./show-report.action.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("serves the page and the JSON, and tells open pages about a new run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ctxray-show-"));
  dirs.push(dir);
  await Bun.write(join(dir, "report.json"), JSON.stringify(REPORT));
  const shown = await createShowReportAction()(dir);
  try {
    expect(shown.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await (await fetch(shown.url)).text()).toContain('<script id="ctxray-report"');
    expect(((await (await fetch(`${shown.url}report.json`)).json()) as { ctxray: string }).ctxray).toBe("0.1.0");
    const events = await fetch(`${shown.url}events`);
    const reader = events.body?.getReader();
    await reader?.read(); // the greeting
    await Bun.write(join(dir, "report.json"), JSON.stringify({ ...REPORT, ctxray: "0.1.1" }));
    const chunk = new TextDecoder().decode((await reader?.read())?.value);
    expect(chunk).toContain("event: reload");
    await reader?.cancel();
  } finally {
    await shown.stop();
  }
});

test("a folder without a report is an error the command words", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ctxray-show-"));
  dirs.push(dir);
  expect(createShowReportAction()(dir)).rejects.toBeInstanceOf(NoReport);
});
