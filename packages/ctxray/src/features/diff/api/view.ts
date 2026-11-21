import { PROFILES } from "#entities/harness/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { span, type View } from "#shared/render/index.ts";
import type { DiffResult } from "../diff.action.ts";

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "±0");
// Commands and MCP servers count as one listing, so a single one has no tokens of its own: only the name shows.
const amount = (component: string, value: number) => (value === 0 ? component : `${component} ${signed(value)}`);

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
            span(`  ${amount(change.component, change.after ?? 0)}`, "muted"),
          ];
        if (change.after === undefined)
          return [span(`   − ${change.id}`, "failure"), span(`  ${amount(change.component, -change.before)}`, "muted")];
        return [
          span(`   ~ ${change.id}`, "warning"),
          span(`  ${amount(change.component, change.after - change.before)}`, "muted"),
        ];
      }),
      [],
    ];
  });
