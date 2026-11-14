import type { CommandSpec, Handler, Values } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { SpectateHooksAction } from "../install.action.ts";
import { type Family, familyOf } from "../lib/places.ts";
import type { SpectateShowAction } from "../show.action.ts";
import { hooksView, sessionsView } from "./view.ts";

export const spectateSpec: CommandSpec = {
  name: "spectate",
  summary: "command.spectate",
  subcommands: { show: "spectate.show", install: "spectate.install", uninstall: "spectate.uninstall" },
  defaultSubcommand: "show",
  options: {
    harness: { type: "string", summary: "option.spectateHarness", value: "ids" },
    last: { type: "string", summary: "option.last", value: "count" },
    json: { type: "boolean", summary: "option.json" },
  },
};

const idsOf = (value: Values[string]) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((one) => one.trim())
        .filter((one) => one !== "")
    : undefined;

export const createSpectateCommand =
  (hooks: SpectateHooksAction, show: SpectateShowAction, t: Translate, renderer: Renderer): Handler =>
  async (values, [sub = "show"]) => {
    const fail = (key: Parameters<Translate>[0], params?: Parameters<Translate>[1]) => {
      renderer.print([[span(t(key, params), "failure")]]);
      return ExitCode.usage;
    };
    const asked = idsOf(values["harness"]);
    const unknown = asked?.find((id) => !HarnessId.safeParse(id).success);
    if (unknown) return fail("error.unknownHarness", { name: unknown, known: HarnessId.options.join(", ") });
    const harnesses = asked as HarnessId[] | undefined;
    if (sub === "install" || sub === "uninstall") {
      const families = [...new Set((harnesses ?? ["claude-code", "cursor-ide"]).map(familyOf))];
      if (families.includes(undefined)) return fail("spectate.noHooks", { harnesses: "Codex, Gemini CLI, OpenCode" });
      const run = sub === "install" ? hooks.install : hooks.uninstall;
      const changes = await run(families as Family[]);
      renderer.print(hooksView(changes, hooks.dir, sub === "install", t));
      return changes.some((change) => "error" in change) ? ExitCode.failed : ExitCode.ok;
    }
    const last = typeof values["last"] === "string" ? Number(values["last"]) : 5;
    if (!Number.isInteger(last) || last < 1) return fail("spectate.badLast", { value: String(values["last"]) });
    const { dir, sessions } = await show({ last, ...(harnesses && { harnesses }) });
    if (values["json"] === true) renderer.print([[span(JSON.stringify({ dir, sessions }, null, 2))]]);
    else renderer.print(sessionsView(sessions, dir, t));
    return ExitCode.ok;
  };
createSpectateCommand.inject = ["spectateHooksAction", "spectateShowAction", "t", "renderer"] as const;
