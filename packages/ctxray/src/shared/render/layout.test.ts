import { describe, expect, test } from "bun:test";
import { columns, widthOf } from "./layout.ts";
import { toPlain } from "./plain.ts";
import { span } from "./view.ts";

describe("widthOf", () => {
  test.each([
    ["tests", 5],
    ["тестов", 6],
    ["ёлка Ё", 6],
    ["工具", 4],
    ["🚀 rule", 7],
    ["\u001b[32mok\u001b[39m", 2],
  ])("%p is %i columns wide", (text, width) => {
    expect(widthOf(text)).toBe(width);
  });
});

describe("columns", () => {
  // Where the second column starts, in display columns, on every rendered line.
  const secondColumnStarts = (labels: readonly string[]) =>
    toPlain(columns(labels.map((label) => [span(label), span("|")])))
      .trimEnd()
      .split("\n")
      .map((line) => widthOf(line.slice(0, line.indexOf("|"))));

  test.each([
    ["Latin", ["init", "inspect", "diff"]],
    ["Cyrillic", ["тест", "проверка", "ёж"]],
    ["mixed scripts", ["tests", "тестов", "工具", "🚀 rule", "❤️ ok"]],
  ])("keeps %s columns straight", (_, labels) => {
    expect(new Set(secondColumnStarts(labels)).size).toBe(1);
  });

  test("pads to the widest cell plus the gap and leaves the last cell alone", () => {
    const view = columns(
      [
        [span("a"), span("bb"), span("c")],
        [span("ccc"), span("d"), span("e")],
      ],
      { indent: 1, gap: 2 },
    );
    expect(toPlain(view)).toBe(" a    bb  c\n ccc  d   e\n");
  });

  test("keeps tones of the cells", () => {
    const [line] = columns([[span("✓", "success"), span("done", "muted")]]);
    expect(line?.map((part) => part.tone)).toEqual(["success", "plain", "muted"]);
  });
});

describe("toPlain", () => {
  test("joins spans, drops colour and trailing spaces, and ends with a newline", () => {
    expect(toPlain([[span("✗", "failure"), span(" codex  ")], [], [span("done", "muted")]])).toBe("✗ codex\n\ndone\n");
  });
});
