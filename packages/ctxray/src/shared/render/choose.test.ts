import { expect, test } from "bun:test";
import { chooseRenderer, type Terminal } from "./choose.ts";

const terminal: Terminal = { tty: true, ci: false, plain: false, env: {} };

test.each<[string, Partial<Terminal>, "ink" | "plain"]>([
  ["a plain terminal", {}, "ink"],
  ["piped stdout", { tty: false }, "plain"],
  ["CI", { ci: true }, "plain"],
  ["--plain or --no-color", { plain: true }, "plain"],
  ["NO_COLOR=1", { env: { NO_COLOR: "1" } }, "plain"],
  ["an empty NO_COLOR", { env: { NO_COLOR: "" } }, "ink"],
  ["TERM=dumb", { env: { TERM: "dumb" } }, "plain"],
  ["TERM=xterm-256color", { env: { TERM: "xterm-256color" } }, "ink"],
])("%s gets the %s renderer", (_, overrides, expected) => {
  expect(chooseRenderer({ ...terminal, ...overrides })).toBe(expected);
});
