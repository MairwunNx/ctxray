import type { SessionUsage } from "claude-code";
import { expect, test } from "claude-code/testing";
import { wordsFor } from "./i18n";
import { toSnapshot } from "./snapshot";

// Runs with `claude plugin test packages/claude-plugin`, not with `bun test`: it needs Claude Code's kit.
const SURFACES = ["terminal", "desktop", "vscode", "mobile"] as const;
const ROOT = "/work/shop";

const usage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    window: 1_000_000,
    breakdown: {
      categories: [
        { name: "System prompt", tokens: 2100, color: "promptBorder", isDeferred: false, kind: "used" },
        { name: "System tools", tokens: 6600, color: "inactive", isDeferred: false, kind: "used" },
        { name: "System tools (deferred)", tokens: 4600, color: "inactive", isDeferred: true, kind: "deferred" },
        { name: "Memory files", tokens: 54, color: "claude", isDeferred: false, kind: "used" },
        { name: "Free space", tokens: 950_000, color: "promptBorder", isDeferred: false, kind: "free" },
      ],
      rawMaxTokens: 1_000_000,
      model: "claude-opus-5-5",
      memoryFiles: [
        { path: `${ROOT}/docs/style.md`, type: "Project", tokens: 25 },
        { path: `${ROOT}/CLAUDE.md`, type: "Project", tokens: 29 },
        { path: "/home/anna/.claude/CLAUDE.md", type: "User", tokens: 12 },
      ],
      mcpTools: [
        { name: "mcp__db__query", serverName: "db", tokens: 300, isLoaded: true },
        { name: "mcp__db__schema", serverName: "db", tokens: 90, isLoaded: false },
      ],
      skills: {
        totalSkills: 2,
        includedSkills: 2,
        tokens: 91,
        skillFrontmatter: [
          { name: "refunds", source: "projectSettings", tokens: 9 },
          { name: "ctxray:write-tests", source: "plugin", pluginName: "ctxray", tokens: 82 },
        ],
      },
    },
  },
} as unknown as SessionUsage;

const snapshot = toSnapshot({
  usage,
  imports: { [`${ROOT}/docs/style.md`]: `${ROOT}/CLAUDE.md` },
  used: ["refunds"],
  cwd: ROOT,
  home: "/home/anna",
  words: wordsFor("en"),
});

test("the snapshot counts what the context holds and keeps imports under their file", async () => {
  expect(snapshot?.used).toBe(8754);
  expect(snapshot?.shares.map((share) => share.name)).toEqual(["System tools", "System prompt", "Memory files"]);
  expect(snapshot?.files.map((file) => `${file.depth} ${file.name} ${file.note}`)).toEqual([
    "0 CLAUDE.md project",
    "1 docs/style.md @ from CLAUDE.md",
    "0 ~/.claude/CLAUDE.md user",
  ]);
  expect(snapshot?.tools.map((tool) => `${tool.name} ${tool.tokens}`)).toEqual([
    "Built-in tools 6600",
    "db 300",
    "Built-in, behind tool search 4600",
  ]);
  expect(snapshot?.skills.map((skill) => `${skill.name} ${skill.note}`)).toEqual([
    "ctxray:write-tests plugin",
    "refunds project · used",
  ]);
});

// What `$.state.get` answers: a stored value at version 1, or nothing written yet at version 0.
const stored = (value: unknown) => ({ value: { value, version: value === undefined ? 0 : 1 } });

test("the band and the pane draw the snapshot on every surface", async ($, on) => {
  on("state.get", (_, e) => {
    const key = (e as { key?: string }).key;
    if (key === "snapshot") return stored({ shape: "snapshot-1", value: snapshot });
    if (key === "tab") return stored("files");
    return stored(undefined);
  });
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: "ctxray",
      component: "AbovePrompt",
      surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 3, bodyColumns: 140 },
    } as never);
    expect((await band.find({ type: "Text", text: /8\.8k/ }))?.text).toContain("8.8k · <1%");
    expect(await band.find({ type: "Button", key: "ctxray-open" })).toBeDefined();
    await band.unmount();
    const pane = await $.ui.mount({
      plugin: "ctxray",
      component: "Pane",
      requestId: "ctxray-loadout",
      surface,
      props: {
        title: "ctxray · Loadout",
        isFocused: true,
        bodyColumns: 64,
        placement: "dock",
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
    } as never);
    expect(await pane.find({ type: "Text", text: /docs\/style\.md/ })).toBeDefined();
    expect(await pane.findAll({ type: "Button" })).toHaveLength(4);
    await pane.unmount();
  }
});
