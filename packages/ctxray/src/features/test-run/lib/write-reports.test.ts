import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Report } from "#shared/contract/index.ts";
import { createTranslator } from "#shared/i18n/index.ts";
import { writeReports } from "./write-reports.ts";

const dir = mkdtempSync(join(tmpdir(), "ctxray-reports-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const root = join(dir, "project");
const t = createTranslator("en");
const report = { schema: "test" } as unknown as Report;

test.each([
  ["a relative folder lands under the project", "out/report", join(root, "out/report")],
  ["an absolute folder stays where it points", join(dir, "elsewhere"), join(dir, "elsewhere")],
])("%s", async (_, asked, where) => {
  await writeReports(report, { reporters: new Set(["json"]), langs: ["en"], dir: asked }, root, {}, t);
  expect(existsSync(join(where, "report.json"))).toBe(true);
});

test("an absolute folder leaves the project untouched", () => {
  expect(existsSync(join(root, dir.slice(1)))).toBe(false);
});
