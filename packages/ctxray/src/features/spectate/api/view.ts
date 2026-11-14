import { PROFILES } from "#entities/harness/index.ts";
import type { Translate } from "#shared/i18n/index.ts";
import { columns, span, type View } from "#shared/render/index.ts";
import type { HooksChange } from "../install.action.ts";
import type { Loaded } from "../lib/sessions.ts";
import type { ShownSession } from "../show.action.ts";

export const hooksView = (changes: readonly HooksChange[], dir: string, installed: boolean, t: Translate): View => [
  ...changes.map((change) => {
    if ("error" in change)
      return [span(` ✗ ${t("spectate.badFile", { file: change.file, message: change.error })}`, "failure")];
    if (change.events.length === 0) {
      return [span(` · ${t(installed ? "spectate.already" : "spectate.none", { file: change.file })}`, "muted")];
    }
    const key = installed ? "spectate.added" : "spectate.removed";
    return [span(" ✓ ", "success"), span(t(key, { file: change.file, events: change.events.join(", ") }))];
  }),
  ...(installed
    ? [[], [span(` ${t("spectate.where", { dir })}`, "muted")], [span(` ${t("spectate.next")}`, "muted")]]
    : []),
];

// Claude Code's load reasons, in the words of the view.
const reasonOf = (loaded: Loaded, t: Translate) => {
  switch (loaded.reason) {
    case "session_start":
      return t("spectate.atStart");
    case "nested_traversal":
      return t("spectate.onRead", { file: loaded.trigger ?? "?" });
    case "path_glob_match":
      return t("spectate.onGlob", { file: loaded.trigger ?? "?" });
    case "include":
      return t("spectate.imported", { file: loaded.parent ?? "?" });
    default:
      return loaded.reason;
  }
};

const when = (at: number) => {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const sessionView = (session: ShownSession, t: Translate): View => {
  const tokens = (count: number | undefined) => (count === undefined ? "" : t("inspect.tokens", { tokens: count }));
  const head = [PROFILES[session.harness].title, when(session.started), session.cwd ?? "?"].join(" · ");
  const facts = [session.model, session.version, session.entrypoint, t("spectate.prompts", { count: session.prompts })]
    .filter(Boolean)
    .join(" · ");
  const loaded = columns(
    session.loaded.map((one) => [
      span(`    ${one.path}`),
      span(tokens(session.tokens[one.path])),
      span(reasonOf(one, t), "muted"),
    ]),
  );
  const resolved = columns(
    (session.resolved ?? []).map((rule) => [
      span(`    ${rule.path}`),
      span(tokens(rule.tokens)),
      span(`${rule.activation} · ${rule.reason}`, "muted"),
    ]),
  );
  return [
    [span(` ${head}`, "strong")],
    [span(`   ${facts}`, "muted")],
    ...(session.family === "claude"
      ? [[span(`   ${t("spectate.loaded")}`)], ...loaded]
      : [
          [span(`   ${t("spectate.read", { count: session.read.length })}`)],
          ...(session.resolved ? [[span(`   ${t("spectate.resolved")}`)], ...resolved] : []),
        ]),
    [],
  ];
};

export const sessionsView = (sessions: readonly ShownSession[], dir: string, t: Translate): View =>
  sessions.length === 0
    ? [[span(` ${t("spectate.empty")}`, "muted")]]
    : [...sessions.flatMap((session) => sessionView(session, t)), [span(` ${t("spectate.log", { dir })}`, "muted")]];
