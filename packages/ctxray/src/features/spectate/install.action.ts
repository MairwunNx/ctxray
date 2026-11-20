import { homedir } from "node:os";
import type { Env } from "#shared/infra/index.ts";
import { readHooksFile, writeHooksFile } from "./lib/files.ts";
import { addHooks, MARK, removeHooks } from "./lib/hooks.ts";
import { installPlugin, uninstallPlugin } from "./lib/opencode-plugin.ts";
import { FAMILIES, type Family, hooksFile, spectateDir } from "./lib/places.ts";

export type HooksChange =
  | { family: Family; file: string; events: string[] }
  | { family: Family; file: string; error: string };

const quote = (part: string) => `'${part.replaceAll("'", `'\\''`)}'`;

// `ctxray spectate install` and `uninstall`: ctxray's hook in the user's own Claude Code settings and Cursor
// hooks.json, merged into what's there and never replacing it, and ctxray's plugin among OpenCode's. The hook logs to ctxray's folder on this machine.
export const createSpectateHooksAction = (env: Env, self: readonly string[]) => {
  const home = env["HOME"] || homedir();
  const dir = spectateDir(env, process.platform, home);
  const change = async (
    family: Family,
    edit: (json: Record<string, unknown>) => { json: Record<string, unknown>; events: string[] },
  ): Promise<HooksChange> => {
    const file = hooksFile(family, env, home);
    const read = await readHooksFile(file);
    if ("error" in read) return { family, file, error: read.error };
    const { json, events } = edit(read.json);
    if (events.length > 0) await writeHooksFile(file, json);
    return { family, file, events };
  };
  const command = (family: Family) => [...self, MARK, family, dir].map(quote).join(" ");
  // OpenCode takes a plugin file of ctxray's own, not entries in a settings file.
  const plugin = async (installing: boolean): Promise<HooksChange> => {
    const file = hooksFile("opencode", env, home);
    const done = installing ? await installPlugin(file, [...self, MARK, "opencode", dir]) : await uninstallPlugin(file);
    if (done.foreign) return { family: "opencode", file, error: "not ctxray's plugin" };
    return { family: "opencode", file, events: done.changed ? [...FAMILIES.opencode.events] : [] };
  };
  return {
    dir,
    install: (families: readonly Family[]) =>
      Promise.all(
        families.map((family) =>
          family === "opencode"
            ? plugin(true)
            : change(family, (json) => {
                const { file, added } = addHooks(family, json, command(family));
                return { json: file, events: added };
              }),
        ),
      ),
    uninstall: (families: readonly Family[]) =>
      Promise.all(
        families.map((family) =>
          family === "opencode"
            ? plugin(false)
            : change(family, (json) => {
                const { file, removed } = removeHooks(json);
                return { json: file, events: removed };
              }),
        ),
      ),
  };
};
createSpectateHooksAction.inject = ["env", "self"] as const;
export type SpectateHooksAction = ReturnType<typeof createSpectateHooksAction>;
