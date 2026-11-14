import type { Problem } from "#entities/harness/index.ts";
import { CONFIG_OPTION, type Config } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler, Values } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { createRedactor } from "#shared/redact/index.ts";
import { type Line, type Renderer, span } from "#shared/render/index.ts";
import type { InspectAction } from "../inspect.action.ts";
import { toJson } from "./json.ts";
import { inspectView } from "./view.ts";

export const inspectSpec: CommandSpec = {
  name: "inspect",
  summary: "command.inspect",
  options: {
    harness: { type: "string", summary: "option.harness", value: "ids" },
    cwd: { type: "string", summary: "option.cwd", value: "dir" },
    files: { type: "string", summary: "option.files", value: "paths" },
    json: { type: "boolean", summary: "option.json" },
    "ignore-harness-differences": { type: "boolean", summary: "option.ignoreHarnessDifferences" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const listOf = (value: Values[string]) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "")
    : undefined;

const text = (value: Values[string]) => (typeof value === "string" ? value : undefined);

export const createInspectCommand =
  (inspect: InspectAction, t: Translate, renderer: Renderer, config: Config, env: Env): Handler =>
  async (values) => {
    const fail = (line: Line) => {
      renderer.print([line]);
      return ExitCode.usage;
    };
    const harnesses = listOf(values["harness"]);
    const unknown = harnesses?.find((id) => !HarnessId.safeParse(id).success);
    if (unknown !== undefined) {
      return fail([span(t("error.unknownHarness", { name: unknown, known: HarnessId.options.join(", ") }), "failure")]);
    }
    const result = await inspect({
      harnesses: harnesses as HarnessId[] | undefined,
      cwd: text(values["cwd"]),
      files: listOf(values["files"]),
      differences: values["ignore-harness-differences"] !== true,
    });
    if ("missingFolder" in result) return fail([span(t("inspect.noFolder", { dir: result.missingFolder }), "failure")]);
    // Problem messages quote the files, so they pass the same redaction as any other output.
    const redactor = createRedactor(config.redact.patterns);
    const message = (problem: Problem) => redactor.text(t(problem.key, problem.params));
    if (values["json"] === true) {
      renderer.print(toJson(result, message).map((line) => [span(line)]));
    } else {
      renderer.print(inspectView(result, t, message, env["HOME"]));
    }
    return ExitCode.ok;
  };
createInspectCommand.inject = ["inspectAction", "t", "renderer", "config", "env"] as const;
