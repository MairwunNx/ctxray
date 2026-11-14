import type { LoadoutChange } from "#entities/loadout/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Line, type Span, span, type View } from "#shared/render/index.ts";
import type { Upgrade } from "../upgrade.action.ts";

const number = (value: number) => value.toLocaleString("en-US");
const delta = (before: number, after: number): Span => {
  const change = after - before;
  if (change === 0) return span("±0", "muted");
  return span(change > 0 ? `+${number(change)}` : `−${number(-change)}`, change > 0 ? "warning" : "success");
};

const changeRow = ({ component, id, before, after }: LoadoutChange): Span[] => {
  if (before === undefined)
    return [span("+", "warning"), span(component, "muted"), span(id), span(number(after ?? 0)), delta(0, after ?? 0)];
  if (after === undefined)
    return [span("−", "success"), span(component, "muted"), span(id), span(number(before)), delta(before, 0)];
  return [
    span("~"),
    span(component, "muted"),
    span(id),
    span(`${number(before)} → ${number(after)}`),
    delta(before, after),
  ];
};

const upgradeView = ({ harness, before, after, diff, failure }: Upgrade, t: Translate): View => {
  const head: Line = [span(" "), span(harness, "strong"), span(`  ${before.version} → ${after.version}`)];
  if (before.version === after.version)
    return [[...head.slice(0, 2), span(`  ${t("harness.upToDate", { version: after.version })}`, "muted")], []];
  if (failure) return [head, [span(`   ${t(failure.key, failure.params)}`, "warning")], []];
  if (!diff) return [head, []];
  const components = Object.entries(diff.byComponent).map(([component, { before: was, after: is }]) => [
    span(component, "muted"),
    span(`${number(was)} → ${number(is)}`),
    delta(was, is),
  ]);
  return [
    head,
    [
      span(`   ${t("harness.startingContext")}  `),
      span(`${number(diff.total.before)} → ${number(diff.total.after)}  `),
      delta(diff.total.before, diff.total.after),
    ],
    ...columns(components, { indent: 5 }),
    ...(diff.changes.length === 0
      ? [[span(`   ${t("harness.sameLoadout")}`, "muted")]]
      : [[], ...columns(diff.changes.map(changeRow), { indent: 3 })]),
    [],
  ];
};

export const upgradesView = (lockPath: string, upgrades: readonly Upgrade[], dryRun: boolean, t: Translate): View => [
  ...upgrades.flatMap((upgrade) => upgradeView(upgrade, t)),
  [span(` ${dryRun ? t("harness.dryRun") : t("harness.lockWritten", { file: lockPath })}`, "muted")],
];
