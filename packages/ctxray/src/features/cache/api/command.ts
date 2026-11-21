import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { CacheAction } from "../cache.action.ts";
import { clearAskView, listView, prunedView } from "./view.ts";

export const cacheSpec: CommandSpec = {
  name: "cache",
  summary: "command.cache",
  subcommands: { dir: "cache.dir", ls: "cache.ls", prune: "cache.prune", clear: "cache.clear" },
  options: {
    "older-than": { type: "string", summary: "option.olderThan", value: "days" },
    all: { type: "boolean", summary: "option.pruneAll" },
    yes: { type: "boolean", short: "y", summary: "option.yes" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

export const createCacheCommand =
  (cache: CacheAction, t: Translate, renderer: Renderer): Handler =>
  async (values, [sub]) => {
    if (sub === "dir") {
      // Only the path, for scripts: `actions/cache` with `path: $(ctxray cache dir)`.
      const dirs = await cache.dirs();
      renderer.print([[span(dirs.write ?? dirs.all[0] ?? "")]]);
      return ExitCode.ok;
    }
    if (sub === "ls") {
      const dirs = await cache.dirs();
      renderer.print(listView(dirs.all, await cache.list(), t));
      return ExitCode.ok;
    }
    if (sub === "clear") {
      // Without --yes nothing goes: the list of what would, and the command that removes it.
      if (values["yes"] === true) {
        renderer.print(prunedView(await cache.clear(), t, "cache.empty"));
        return ExitCode.ok;
      }
      const builds = (await cache.list()).filter((build) => !build.shared);
      renderer.print(clearAskView(builds, t));
      return builds.length === 0 ? ExitCode.ok : ExitCode.usage;
    }
    const raw = values["older-than"];
    const days = values["all"] === true ? 0 : typeof raw === "string" ? Number(raw) : 30;
    if (!Number.isFinite(days) || days < 0) {
      renderer.print([[span(t("cache.badDays", { value: String(raw) }), "failure")]]);
      return ExitCode.usage;
    }
    renderer.print(prunedView(await cache.prune(days), t));
    return ExitCode.ok;
  };
createCacheCommand.inject = ["cacheAction", "t", "renderer"] as const;
