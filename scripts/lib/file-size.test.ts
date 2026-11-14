import { describe, expect, test } from "bun:test";
import { countLines, findOversized, isChecked } from "./file-size.ts";

describe("countLines", () => {
  test.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\ntwo", 2],
    ["one\ntwo\n", 2],
    ["\n", 1],
    ["\n\n", 2],
    ["кириллица\n🚀\n", 2],
  ])("%j has %i lines", (text, lines) => {
    expect(countLines(text)).toBe(lines);
  });
});

describe("isChecked", () => {
  test.each([
    ["packages/ctxray/src/app/main.ts", true],
    ["packages/ctxray/src/shared/render/table.tsx", true],
    ["scripts/check-file-size.ts", true],
    ["packages/plugin/hooks/session-start.mjs", true],
    ["packages/ctxray/src/shared/i18n/locales/ru/report.ts", false],
    ["packages/ctxray/test/fixtures/android-repo/build.ts", false],
    ["fixtures/demo.ts", false],
    ["README.md", false],
    ["bun.lock", false],
    ["packages/ctxray/package.json", false],
    ["Feature-Action-Architecture", false],
  ])("%s → %p", (path, checked) => {
    expect(isChecked(path)).toBe(checked);
  });
});

describe("findOversized", () => {
  const lines = (count: number) => "x\n".repeat(count);

  test.each([
    [199, []],
    [200, []],
    [201, [{ path: "src/big.ts", lines: 201 }]],
  ])("a file of %i lines", (count, expected) => {
    expect(findOversized([{ path: "src/big.ts", text: lines(count) }])).toEqual(expected);
  });

  test("ignores exempt and non-code files whatever their size", () => {
    const files = [
      { path: "src/i18n/locales/en/cli.ts", text: lines(900) },
      { path: "README.md", text: lines(900) },
    ];
    expect(findOversized(files)).toEqual([]);
  });

  test("honours a custom limit", () => {
    expect(findOversized([{ path: "a.ts", text: lines(3) }], 2)).toEqual([{ path: "a.ts", lines: 3 }]);
  });
});
