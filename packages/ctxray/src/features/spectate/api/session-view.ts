import { homedir } from "node:os";
import { sep } from "node:path";
import type { LoadoutSnapshot } from "#shared/contract/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, type Span, span, type View, widthOf } from "#shared/render/index.ts";
import type { SessionLoadout } from "../session.action.ts";

type Row = [label: Span, tokens: string, detail: string];

const section = (title: string, tokens: string, entries: Row[]): Row[] =>
  entries.length === 0 ? [] : [[span(`  ${title}`, "strong"), tokens, ""], ...entries];

const entry = (label: string, tokens: string, detail = ""): Row => [span(`    ${label}`), tokens, detail];

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

// The project's own skills one by one, then the ones Claude Code ships in a single line: nobody edits those.
const skillRows = (
  skills: readonly { name: string; tokens?: number | undefined; builtin?: boolean | undefined; path?: string }[],
  tokens: (count: number | undefined) => string,
  t: Translate,
): Row[] => {
  const builtin = skills.filter((skill) => skill.builtin);
  const sum = builtin.reduce((total, skill) => total + (skill.tokens ?? 0), 0);
  return [
    ...skills.filter((skill) => !skill.builtin).map((skill) => entry(skill.name, tokens(skill.tokens), skill.path)),
    ...(builtin.length > 0 ? [entry(t("session.builtinSkills", { count: builtin.length }), tokens(sum))] : []),
  ];
};

const rowsOf = (loadout: LoadoutSnapshot, t: Translate): Row[] => {
  const tokens = (count: number | undefined) => (count === undefined ? "" : t("inspect.tokens", { tokens: count }));
  const { byComponent, byMcpServer, total } = loadout.tokens;
  const counted = Object.values(byComponent).reduce((sum, count) => sum + count, 0);
  const tools = loadout.mcp.tools.filter((tool) => !tool.own);
  const notOwn = (one: { own?: boolean | undefined }) => !one.own;
  return [
    [span(t("session.total"), "strong"), tokens(total), ""],
    [span(`  ${t("session.system")}`, "strong"), tokens(byComponent.system), ""],
    [span(`  ${t("session.tools")}`, "strong"), tokens(byComponent.tools), ""],
    ...section(
      t("inspect.rules"),
      tokens(byComponent.rules),
      loadout.rules.map((rule) => entry(rule.path, tokens(rule.tokens), rule.reason)),
    ),
    ...section(
      t("inspect.skills"),
      tokens(byComponent.skills),
      skillRows([...loadout.skills.listed.filter(notOwn), ...loadout.skills.loaded.filter(notOwn)], tokens, t),
    ),
    ...section(
      t("inspect.mcp"),
      tokens(byComponent.mcp),
      loadout.mcp.servers.filter(notOwn).map(({ name }) => {
        const mine = tools.filter((tool) => tool.server === name);
        const deferred = mine.filter((tool) => tool.deferred).length;
        return entry(name, tokens(byMcpServer[name]), t("session.mcpTools", { count: mine.length, deferred }));
      }),
    ),
    [span(`  ${t("session.conversation")}`, "strong"), tokens(total - counted), ""],
  ];
};

// The project folder the way Claude Code's own header writes it: under the home folder as `~/…`.
const homely = (path: string | undefined, home = homedir()) =>
  path && home && (path === home || path.startsWith(home + sep)) ? `~${path.slice(home.length)}` : path;

// `/ctxray` in a Claude Code session: what the session's latest request carried, piece by piece. A `live` session
// is the one `/ctxray` runs in, which has no transcript until its first request.
export const sessionLoadoutView = (result: SessionLoadout, t: Translate, live = false): View => {
  if (!result.found && live) return [[span(` ${t("session.fresh")}`, "muted")]];
  if (!result.found) return [[span(` ${t("session.missing", { id: result.id })}`, "failure")]];
  const { loadout } = result;
  if (!loadout) return [[span(` ${t("session.noRequests", { id: result.id })}`, "muted")]];
  const { version, model } = loadout.harness;
  const head = [
    `Claude Code ${version}`.trim(),
    model,
    homely(result.cwd),
    t("session.request", { count: result.requests }),
  ];
  const own = loadout.tokens.own;
  return [
    [span(" "), span(head.filter(Boolean).join(" · "), "strong")],
    [],
    ...aligned(rowsOf(loadout, t)),
    [],
    ...(own ? [[span(` ${t("session.own", { tokens: own })}`, "muted")]] : []),
    [span(` ${t("inspect.estimate", { tokenizer: loadout.tokens.method.replace(/^local:/, "") })}`, "muted")],
    [span(` ${t("inspect.uncalibrated")}`, "muted")],
  ];
};
