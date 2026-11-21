import { relative } from "node:path";
import { ProvisionFailure, progressView } from "#entities/harness-cache/index.ts";
import { LockfileFailure } from "#entities/lockfile/index.ts";
import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler, Values } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { HarnessAddAction } from "../add.action.ts";
import type { HarnessInstallAction } from "../install.action.ts";
import { harnessIdOf } from "../lib/context.ts";
import type { HarnessListAction } from "../list.action.ts";
import type { HarnessPackAction } from "../pack.action.ts";
import type { HarnessRemoveAction } from "../remove.action.ts";
import type { HarnessUpgradeAction } from "../upgrade.action.ts";
import { upgradesView } from "./upgrade-view.ts";
import { addView, installView, listView, packView, removeView } from "./view.ts";

export const harnessSpec: CommandSpec = {
  name: "harness",
  summary: "command.harness",
  subcommands: {
    add: "harness.add",
    install: "harness.install",
    list: "harness.list",
    pack: "harness.pack",
    remove: "harness.remove",
    upgrade: "harness.upgrade",
  },
  options: {
    only: { type: "string", summary: "option.only", value: "ids" },
    frozen: { type: "boolean", summary: "option.frozen" },
    from: { type: "string", summary: "option.from", value: "archive" },
    output: { type: "string", short: "o", summary: "option.output", value: "file" },
    platform: { type: "string", summary: "option.platform", value: "keys|all" },
    "dry-run": { type: "boolean", summary: "option.dryRun" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const list = (value: Values[string]) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((one) => one.trim())
        .filter((one) => one !== "")
    : undefined;

export const createHarnessCommand =
  (
    add: HarnessAddAction,
    install: HarnessInstallAction,
    listed: HarnessListAction,
    pack: HarnessPackAction,
    upgrade: HarnessUpgradeAction,
    remove: HarnessRemoveAction,
    t: Translate,
    renderer: Renderer,
    cwd: string,
  ): Handler =>
  async (values, [sub, ...args]) => {
    const fail = (
      key: Parameters<Translate>[0],
      params?: Parameters<Translate>[1],
      code: ExitCode = ExitCode.usage,
    ) => {
      renderer.print([[span(t(key, params), "failure")]]);
      return code;
    };
    try {
      if (sub === "add") {
        if (args.length === 0) return fail("harness.addWhat");
        const { lockPath, changes } = await add(args);
        renderer.print(addView(relative(cwd, lockPath), changes, t));
        return ExitCode.ok;
      }
      if (sub === "remove") {
        if (args.length === 0) return fail("harness.removeWhat");
        const result = await remove(args);
        renderer.print(removeView({ ...result, lockPath: relative(cwd, result.lockPath) }, t));
        return ExitCode.ok;
      }
      if (sub === "install") {
        const result = await install(
          {
            only: list(values["only"])?.map(harnessIdOf),
            frozen: values["frozen"] === true,
            from: typeof values["from"] === "string" ? values["from"] : undefined,
          },
          (harness, progress) => renderer.live(progressView(harness, progress, t)),
        );
        renderer.live(undefined);
        renderer.print(installView(result, t));
        const broken =
          (result.frozen && result.problems.length > 0) ||
          result.outcomes.some((outcome) => outcome.kind === "missing");
        return broken ? ExitCode.environment : ExitCode.ok;
      }
      if (sub === "upgrade") {
        if (args.length === 0) return fail("harness.upgradeWhat");
        const dryRun = values["dry-run"] === true;
        const result = await upgrade(args, dryRun, (event) =>
          renderer.live(
            event.kind === "install"
              ? progressView(event.harness, event.progress, t)
              : [[span(` ${t("harness.capturing", { harness: event.harness, version: event.version })}`, "muted")]],
          ),
        );
        renderer.live(undefined);
        renderer.print(upgradesView(relative(cwd, result.lockPath), result.upgrades, dryRun, t));
        return ExitCode.ok;
      }
      if (sub === "list") {
        const { lockPath, rows } = await listed();
        renderer.print(listView(relative(cwd, lockPath), rows, t));
        return ExitCode.ok;
      }
      const platforms = values["platform"] === "all" ? "all" : list(values["platform"]);
      const output = typeof values["output"] === "string" ? values["output"] : "ctxray-harnesses.tar";
      const packed = await pack({ output, platforms });
      renderer.print(packView(packed.output, packed.builds, packed.size, t));
      return ExitCode.ok;
    } catch (error) {
      renderer.live(undefined);
      if (error instanceof ProvisionFailure) {
        return fail(error.key, error.params, error.key === "harness.unknown" ? ExitCode.usage : ExitCode.environment);
      }
      if (error instanceof LockfileFailure) return fail(error.problem.key, error.problem.params, ExitCode.environment);
      throw error;
    }
  };
createHarnessCommand.inject = [
  "harnessAddAction",
  "harnessInstallAction",
  "harnessListAction",
  "harnessPackAction",
  "harnessUpgradeAction",
  "harnessRemoveAction",
  "t",
  "renderer",
  "cwd",
] as const;
