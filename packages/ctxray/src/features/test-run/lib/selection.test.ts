import { describe, expect, test } from "bun:test";
import type { HarnessId, Layer } from "#shared/contract/index.ts";
import type { Kind, TestDefinition, TestOptions } from "./model.ts";
import { type Decision, decide, LAYERS, parseLayers, type Selection } from "./selection.ts";

describe("parseLayers", () => {
  test.each<[string, Layer[] | undefined]>([
    ["L3", ["L3"]],
    ["L1-L5", ["L1", "L2", "L3", "L4", "L5"]],
    ["l1, l3,L5-L7", ["L1", "L3", "L5", "L6", "L7"]],
    ["3-4", ["L3", "L4"]],
    ["L5-L3", undefined],
    ["L8", undefined],
    ["L0", undefined],
    ["", undefined],
    ["L1,", undefined],
    ["L1.5", undefined],
  ])("%p", (text, expected) => {
    const layers = parseLayers(text);
    expect(layers && [...layers].sort()).toEqual(expected);
  });
});

const definition = (kind: Kind, options: TestOptions = {}, name = "budget"): TestDefinition => ({
  file: "/repo/a.ctxray.ts",
  suites: ["payments"],
  fixture: undefined,
  name,
  key: name,
  kind,
  options,
  body: () => {},
});

const ALL: Selection = {
  harnesses: [],
  experimental: new Set(),
  backend: { kind: "mock", name: undefined },
  layers: new Set(LAYERS),
  filter: undefined,
};

describe("decide", () => {
  test.each<[string, TestDefinition, HarnessId, Partial<Selection>, Decision]>([
    ["L3 on Claude Code runs", definition("resolve"), "claude-code", {}, { run: true }],
    [
      "a layer left out",
      definition("resolve"),
      "claude-code",
      { layers: new Set(["L4"]) },
      { run: false, reason: "filtered" },
    ],
    [
      "a name the filter misses",
      definition("resolve"),
      "codex",
      { filter: "refund" },
      { run: false, reason: "filtered" },
    ],
    ["a filter on the suite name", definition("resolve"), "codex", { filter: "PAYMENTS" }, { run: true }],
    [
      "a capability Codex lacks",
      definition("resolve", { requires: ["pathRules", "skills"] }),
      "codex",
      {},
      { run: false, reason: "unsupported", missing: ["pathRules"] },
    ],
    [
      "L3 without a static adapter",
      definition("resolve"),
      "claude-code-desktop",
      {},
      { run: false, reason: "unavailable" },
    ],
    ["L4 launches Claude Code on the mock", definition("assemble"), "claude-code", {}, { run: true }],
    [
      "L4 on replay comes later",
      definition("assemble"),
      "codex",
      { backend: { kind: "replay", name: undefined } },
      { run: false, reason: "unavailable" },
    ],
    ["L6 comes later", definition("activate"), "claude-code", {}, { run: false, reason: "unavailable" }],
    [
      "capture Cursor can't do",
      definition("assemble"),
      "cursor-ide",
      {},
      { run: false, reason: "unsupported", missing: ["mode:capture"] },
    ],
    [
      "Cursor CLI's capture waits for the config to turn it on",
      definition("wire"),
      "cursor-cli",
      {},
      { run: false, reason: "unsupported", missing: ["mode:capture"] },
    ],
    [
      "Cursor CLI's capture once the config turns it on",
      definition("wire"),
      "cursor-cli",
      { experimental: new Set(["cursor-cli"] as const) },
      { run: true },
    ],
  ])("%s", (_, test, harness, selection, expected) => {
    expect(decide(test, harness, { ...ALL, ...selection })).toEqual(expected);
  });
});
