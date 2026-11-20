import { expect, test } from "bun:test";
import { join } from "node:path";
import { VERSION } from "./package-info.ts";

// ctxray's plugin for Claude Code ships with the same version as the CLI, and its hooks feed `ctxray spectate`.
// No SessionEnd: a plugin loaded from a zip is gone by then, and Claude Code reports the hook as failed.
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

test("every hook of the plugin runs ctxray's spectate hook", async () => {
  const { hooks } = await json("hooks/hooks.json");
  expect(Object.keys(hooks).sort()).toEqual(["InstructionsLoaded", "SessionStart", "UserPromptSubmit"]);
  for (const groups of Object.values(hooks) as { hooks: { command: string; args: string[] }[] }[][]) {
    expect(groups.flatMap((group) => group.hooks)).toEqual([
      { type: "command", command: "ctxray", args: ["__spectate-hook", "claude"] },
    ] as never);
  }
});
