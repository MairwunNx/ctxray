import { expect, test } from "bun:test";
import { join } from "node:path";
import { countTokens } from "#shared/tokens/index.ts";
import { STATIC_ADAPTERS } from "../adapters.ts";
import { openProject } from "../project.ts";
import { buildLoadout } from "./loadout.ts";
import type { Segment } from "./model.ts";
import { listing } from "./sections.ts";

const project = await openProject(join(import.meta.dir, "../../../../fixtures/capture/payments"));
const statics = STATIC_ADAPTERS["claude-code"];
if (!statics) throw new Error("claude-code");
const inventory = await statics.discover(project);

const ROOT = "/home/me/.claude/plugins/cache/ctxray/ctxray/0.1.0";
const LISTING = "- refunds: Issue full or partial refunds\n- ctxray:write-tests: Write ctxray tests\n";

const segments: Segment[] = [
  { component: "system", id: "prompt-0", text: "You are Claude Code." },
  ...listing(LISTING).map(({ name, line }): Segment => ({ component: "skills", id: name, text: line })),
  { component: "skills", id: `loaded:${ROOT}/skills/write-tests`, text: "How to write *.ctxray.ts tests." },
  { component: "mcp", id: "plugin_ctxray_ctxray/inspect", text: "mcp__plugin_ctxray_ctxray__inspect", deferred: true },
  { component: "mcp", id: "github/create_issue", text: "mcp__github__create_issue", deferred: true },
];

const loadout = buildLoadout({
  harness: { name: "claude-code", version: "2.1.311", model: "claude-sonnet-5-5" },
  segments,
  inventory,
  predicted: statics.resolve(inventory, { cwd: "", files: [] }),
  servers: {},
  work: "/work",
  first: true,
  own: [ROOT],
});

test("a plugin's skill keeps the plugin in its name", () => {
  expect(listing(LISTING).map(({ name }) => name)).toEqual(["refunds", "ctxray:write-tests"]);
});

test("ctxray's own plugin is listed, marked, and left out of every total", () => {
  expect(loadout.skills.listed.map(({ name, own }) => [name, own === true])).toEqual([
    ["refunds", false],
    ["ctxray:write-tests", true],
  ]);
  expect(loadout.skills.loaded.map(({ own }) => own)).toEqual([true]);
  expect(loadout.mcp.servers).toEqual([{ name: "github" }, { name: "plugin_ctxray_ctxray", own: true }]);
  expect(Object.keys(loadout.tokens.byMcpServer)).toEqual(["github"]);
  const counted = segments.filter((one) => !one.id.includes("ctxray")).map((one) => one.text);
  const own = segments.filter((one) => one.id.includes("ctxray")).map((one) => one.text);
  const sum = (texts: string[]) => texts.reduce((total, text) => total + countTokens(text), 0);
  expect(loadout.tokens.total).toBe(sum(counted));
  expect(loadout.tokens.own).toBe(sum(own));
});
