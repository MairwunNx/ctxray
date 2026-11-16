import { PROFILES, UnknownRevision } from "#entities/harness/index.ts";
import { CONFIG_OPTION } from "#entities/user-config/index.ts";
import type { CommandSpec, Handler } from "#shared/cli/index.ts";
import { ExitCode, HarnessId } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { type Renderer, span, type View } from "#shared/render/index.ts";
import type { DiffAction, DiffResult } from "../diff.action.ts";

export const diffSpec: CommandSpec = {
  name: "diff",
  summary: "command.diff",
  options: {
    base: { type: "string", summary: "option.base", value: "ref" },
    harness: { type: "string", summary: "option.harness", value: "ids" },
    json: { type: "boolean", summary: "option.json" },
    config: CONFIG_OPTION,
  },
  usesConfig: true,
};

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export const diffView = (result: DiffResult, t: Translate): View =>
  result.diffs.flatMap(({ harness, diff }) => {
    const delta = diff.total.after - diff.total.before;
    const head = [
      span(` ${PROFILES[harness].title}  `, "strong"),
      span(t("diff.total", { before: diff.total.before, after: diff.total.after })),
      span(`  ${signed(delta)}`, delta > 0 ? "warning" : delta < 0 ? "success" : "muted"),
    ];
    if (diff.changes.length === 0) return [head, [span(`   ${t("diff.same")}`, "muted")], []];
    return [
      head,
      ...diff.changes.map((change) => {
        if (change.before === undefined)
          return [
            span(`   + ${change.id}`, "success"),
            span(`  ${change.component} ${signed(change.after ?? 0)}`, "muted"),
          ];
        if (change.after === undefined)
          return [
            span(`   − ${change.id}`, "failure"),
            span(`  ${change.component} ${signed(-change.before)}`, "muted"),
          ];
        return [
          span(`   ~ ${change.id}`, "warning"),
          span(`  ${change.component} ${signed(change.after - change.before)}`, "muted"),
        ];
      }),
      [],
    ];
  });

export const createDiffCommand =
  (diff: DiffAction, t: Translate, renderer: Renderer): Handler =>
  async (values) => {
    const base = typeof values["base"] === "string" && values["base"] !== "" ? values["base"] : "origin/master";
    const asked =
      typeof values["harness"] === "string" ? values["harness"].split(",").map((id) => id.trim()) : undefined;
    const harnesses = asked?.filter((id): id is HarnessId => HarnessId.safeParse(id).success);
    let result: DiffResult;
    try {
      result = await diff({ base, harnesses });
    } catch (error) {
      if (!(error instanceof UnknownRevision)) throw error;
      renderer.print([[span(t("diff.unknownBase", { ref: base }), "failure")]]);
      return ExitCode.usage;
    }
    if (values["json"] === true) {
      renderer.print([[span(JSON.stringify(result, null, 2))]]);
      return ExitCode.ok;
    }
    renderer.print([
      [span(` ${t("diff.title", { ref: base, commit: result.commit.slice(0, 8) })}`, "strong")],
      [],
      ...diffView(result, t),
    ]);
    return ExitCode.ok;
  };
createDiffCommand.inject = ["diffAction", "t", "renderer"] as const;
