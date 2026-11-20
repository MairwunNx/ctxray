import { expect, test } from "bun:test";
import { join } from "node:path";
import { VERSION } from "./package-info.ts";

// ctxray's plugin for Claude Code ships with the same version as the CLI.
const PLUGIN = join(import.meta.dir, "../../../claude-plugin");
const json = (path: string) => Bun.file(join(PLUGIN, path)).json();

test("one version for the CLI and the plugin", async () => {
  expect((await json(".claude-plugin/plugin.json")).version).toBe(VERSION);
});

test("the marketplace lists the plugin where it lives", async () => {
  const marketplace = await Bun.file(join(import.meta.dir, "../../../../.claude-plugin/marketplace.json")).json();
  const entry = marketplace.plugins.find((one: { name: string }) => one.name === "ctxray");
  expect(entry.source).toBe("./packages/claude-plugin");
});

test("the Loadout band and pane come from one hooks module", async () => {
  expect((await json("hooks/hooks.json")).modules).toEqual(["./register.tsx"]);
});

test("the plugin runs no command hooks: /ctxray reads the session's transcript itself", async () => {
  expect((await json("hooks/hooks.json")).hooks).toBeUndefined();
});

test("/ctxray asks the CLI's hidden session command", async () => {
  const skill = await Bun.file(join(PLUGIN, "skills/ctxray/SKILL.md")).text();
  expect(skill).toContain("ctxray __session --id ${CLAUDE_SESSION_ID}");
});
