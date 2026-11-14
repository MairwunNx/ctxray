import { describe, expect, test } from "bun:test";
import { addHooks, removeHooks } from "./hooks.ts";
import { FAMILIES, type Family } from "./places.ts";

const COMMAND = "'ctxray' '__spectate-hook' 'claude' '/state'";
const theirs = { hooks: [{ type: "command", command: "notify-send done" }] };

describe("ctxray's hooks in the user's file", () => {
  test.each<[Family, Record<string, unknown>]>([
    ["claude", { theme: "dark", hooks: { Stop: [theirs], SessionStart: [theirs] } }],
    ["cursor", { version: 1, hooks: { stop: [{ command: "./audit.sh" }] } }],
  ])("%s: added next to the user's own, removed without a trace", (family, file) => {
    const { file: added, added: events } = addHooks(family, file, COMMAND);
    expect(events).toEqual([...FAMILIES[family].events]);
    expect(addHooks(family, added, COMMAND).added).toEqual([]);
    const { file: back, removed } = removeHooks(added);
    expect(removed.sort()).toEqual([...FAMILIES[family].events].sort());
    expect(back).toEqual(file);
  });

  test("a file without hooks gets them, and loses the key again", () => {
    const { file } = addHooks("cursor", {}, COMMAND);
    expect(file["version"]).toBe(1);
    expect(removeHooks(file).file).toEqual({ version: 1 });
  });
});
