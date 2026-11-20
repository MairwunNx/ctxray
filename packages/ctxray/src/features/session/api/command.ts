import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { SessionAction } from "../session.action.ts";
import { sessionLoadoutView } from "./session-view.ts";

// `ctxray __session --id <id> --plugin-root <dir>`: what the plugin's `/ctxray` runs. No one types it.
export const sessionSpec: CommandSpec = {
  name: "__session",
  summary: "command.session",
  hidden: true,
  options: {
    id: { type: "string", summary: "option.session", value: "id" },
    "plugin-root": { type: "string", summary: "option.pluginRoot", value: "dir" },
    json: { type: "boolean", summary: "option.json" },
  },
};

export const createSessionCommand =
  (session: SessionAction, t: Translate, renderer: Renderer): Handler =>
  async (values) => {
    const id = typeof values["id"] === "string" ? values["id"] : "";
    const root = values["plugin-root"];
    // The plugin asks about the session it runs in: no transcript there means no request yet, not a wrong id.
    const live = typeof root === "string" && root !== "";
    const result = await session(id, live ? [root] : []);
    if (values["json"] === true) renderer.print([[span(JSON.stringify(result, null, 2))]]);
    else renderer.print(sessionLoadoutView(result, t, live));
    return result.found || live ? ExitCode.ok : ExitCode.failed;
  };
createSessionCommand.inject = ["sessionAction", "t", "renderer"] as const;
