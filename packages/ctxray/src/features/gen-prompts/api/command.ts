import { resolve } from "node:path";
import { DEFAULT_HARNESSES } from "#entities/harness/index.ts";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span } from "#shared/render/index.ts";
import type { GenPromptsAction } from "../gen-prompts.action.ts";

export const genPromptsSpec: CommandSpec = {
  name: "gen-prompts",
  summary: "command.genPrompts",
  options: {
    "from-descriptions": { type: "boolean", summary: "option.fromDescriptions" },
    out: { type: "string", summary: "option.promptsOut", value: "file" },
    model: { type: "string", summary: "option.generatorModel", value: "id" },
    count: { type: "string", summary: "option.promptCount", value: "n" },
    harness: { type: "string", summary: "option.harness", value: "ids" },
    force: { type: "boolean", summary: "option.force" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

// A model other than the ones under test, so the prompts don't flatter them (TASK §4.3).
const DEFAULT_MODEL = "claude-opus-5-5";

export const createGenPromptsCommand =
  (genPrompts: GenPromptsAction, t: Translate, renderer: Renderer, config: Config, cwd: string): Handler =>
  async (values) => {
    const out = typeof values["out"] === "string" ? values["out"] : "";
    const count = Number(values["count"] ?? 5);
    if (values["from-descriptions"] !== true || out === "" || !(Number.isInteger(count) && count > 0)) {
      renderer.print([[span(t("genPrompts.usage"), "failure")]]);
      return ExitCode.usage;
    }
    if (config.offline) {
      renderer.print([[span(t("genPrompts.offline"), "failure")]]);
      return ExitCode.usage;
    }
    const file = resolve(cwd, out);
    if ((await Bun.file(file).exists()) && values["force"] !== true) {
      renderer.print([[span(t("genPrompts.exists", { file: out }), "failure")]]);
      return ExitCode.usage;
    }
    const asked =
      typeof values["harness"] === "string" ? values["harness"].split(",").map((id) => id.trim()) : undefined;
    const configured = Object.keys(config.harnesses);
    const harnesses = (asked ?? (configured.length > 0 ? configured : DEFAULT_HARNESSES)).filter(
      (id): id is HarnessId => HarnessId.safeParse(id).success,
    );
    const model = typeof values["model"] === "string" && values["model"] !== "" ? values["model"] : DEFAULT_MODEL;
    const result = await genPrompts({ model, count, harnesses }, (done, total) =>
      renderer.live(done < total ? [[span(` ${t("test.progress", { done, total })}`, "muted")]] : undefined),
    );
    if (result.sameModel.length > 0) {
      renderer.print([
        [
          span(
            ` ⚠ ${t("genPrompts.sameModel", { model, harnesses: result.sameModel, count: result.sameModel.length })}`,
            "warning",
          ),
        ],
      ]);
    }
    for (const { target, message } of result.failed) {
      renderer.print([[span(` ✗ ${target.path}  `, "failure"), span(message, "muted")]]);
    }
    if (result.targets.length === 0) {
      renderer.print([[span(` ${t("genPrompts.nothing")}`, "muted")]]);
      return ExitCode.ok;
    }
    await Bun.write(file, `${JSON.stringify(result.corpus, null, 2)}\n`);
    const written = Object.keys(result.corpus.by).length;
    renderer.print([
      [
        span(
          ` ${t("genPrompts.written", { file: out, count: written, prompts: result.corpus.positive.length + result.corpus.negative.length })}`,
          "success",
        ),
      ],
      [span(` ${t("genPrompts.review")}`, "muted")],
    ]);
    return result.failed.length > 0 ? ExitCode.failed : ExitCode.ok;
  };
createGenPromptsCommand.inject = ["genPromptsAction", "t", "renderer", "config", "cwd"] as const;
