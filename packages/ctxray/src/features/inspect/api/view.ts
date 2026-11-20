import { PROFILES } from "#entities/harness/index.ts";
import type { HarnessId, RuleEntry } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Span, span, type View, widthOf } from "#shared/render/index.ts";
import type { InspectResult } from "../inspect.action.ts";
import type { InspectedHarness } from "../inspection.ts";
import { type Message, problemsView } from "./problems.ts";

// Tokens sit right after the name, so long paths and reasons trail off to the right without pushing them away.
type Row = [label: Span, tokens: string, detail: string];

const tokenizerOf = (method: string) => method.replace(/^local:/, "");

const isEmpty = ({ rules, skills, mcp, commands, problems }: InspectedHarness) =>
  rules.length + skills.listed.length + mcp.servers.length + commands.length + problems.length === 0;

const section = (title: string, tokens: string, entries: Row[]): Row[] =>
  entries.length === 0 ? [] : [[span(`  ${title}`, "strong"), tokens, ""], ...entries];

const entry = (label: string, tokens: string, detail: string): Row => [span(`    ${label}`), tokens, detail];

// `always · always` says nothing twice.
const why = ({ activation, reason }: RuleEntry) => (activation === reason ? activation : `${activation} · ${reason}`);

const rowsOf = (harness: InspectedHarness, t: Translate): Row[] => {
  const tokens = (count: number | undefined) => (count === undefined ? "" : t("inspect.tokens", { tokens: count }));
  const after = t("inspect.afterRun");
  const { byComponent } = harness.tokens;
  return [
    [span(PROFILES[harness.harness].title, "strong"), tokens(harness.tokens.known), ""],
    ...section(
      t("inspect.rules"),
      tokens(byComponent.rules),
      harness.rules.map((rule) => entry(rule.path, tokens(rule.tokens), why(rule))),
    ),
    ...section(
      t("inspect.skills"),
      tokens(byComponent.skills),
      harness.skills.listed.map((skill) =>
        entry(
          skill.name,
          tokens(skill.tokens),
          skill.listing ? `${skill.path} · ${t(`inspect.listing.${skill.listing}`)}` : skill.path,
        ),
      ),
    ),
    ...section(
      t("inspect.commands"),
      tokens(byComponent.commands),
      harness.commands.map((command) => entry(command.name, "", command.path ?? "")),
    ),
    ...section(
      t("inspect.mcp"),
      after,
      harness.mcp.servers.map(({ name }) => entry(name, "", harness.provenance[`mcp:${name}`]?.source ?? "")),
    ),
    [span(`  ${t("inspect.system")}`, "strong"), after, ""],
  ];
};

// Numbers read best right-aligned, so the token cell gets padded on the left.
const aligned = (rows: Row[]): View => {
  const width = Math.max(...rows.map(([, tokens]) => widthOf(tokens)));
  return columns(
    rows.map(([label, tokens, detail]) => [
      label,
      span(" ".repeat(width - widthOf(tokens)) + tokens, "accent"),
      span(detail, "muted"),
    ]),
    { indent: 1 },
  );
};

const harnessView = (harness: InspectedHarness, t: Translate, message: Message): View => {
  const title = span(PROFILES[harness.harness].title, "strong");
  if (isEmpty(harness)) return [[span(" "), title, span(`  ${t("inspect.nothing")}`, "muted")], []];
  return [...aligned(rowsOf(harness, t)), ...problemsView(harness, t, message), []];
};

const where = ({ root, scope }: InspectResult, home: string | undefined, t: Translate): View => {
  const shown = home && root.startsWith(`${home}/`) ? `~${root.slice(home.length)}` : root;
  const cwd = t("inspect.cwd", { cwd: scope.cwd === "" ? "." : scope.cwd });
  const files =
    scope.files.length > 0 ? [[span(` ${t("inspect.files", { files: scope.files.join(", ") })}`, "muted")]] : [];
  return [[span(" "), span(shown, "strong"), span(` · ${cwd}`, "muted")], ...files, []];
};

const notes = (result: InspectResult, t: Translate): View => {
  const shown = result.harnesses.filter((harness) => !isEmpty(harness));
  const methods = [...new Set(shown.map((harness) => tokenizerOf(harness.tokens.method)))];
  const lines = [
    ...methods.map((tokenizer) => t("inspect.estimate", { tokenizer })),
    ...(shown.some((harness) => harness.tokens.calibration === "none") ? [t("inspect.uncalibrated")] : []),
    ...(shown.length > 0 ? [t("inspect.capture")] : []),
    ...result.unsupported.map((id: HarnessId) => t("inspect.notYet", { harness: PROFILES[id].title })),
  ];
  return lines.map((text) => [span(` ${text}`, "muted")]);
};

export const inspectView = (result: InspectResult, t: Translate, message: Message, home: string | undefined): View => [
  ...where(result, home, t),
  ...result.harnesses.flatMap((harness) => harnessView(harness, t, message)),
  ...notes(result, t),
];
