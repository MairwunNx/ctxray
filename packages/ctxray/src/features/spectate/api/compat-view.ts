import type { MessageKey, Translate } from "#shared/i18n/index.ts";
import { span, type View, widthOf } from "#shared/render/index.ts";

// What spectate can see of each harness: it reads what the harness keeps of a session, and that differs.
const ROWS: [harness: string, full: boolean, key: MessageKey][] = [
  ["Claude Code", true, "spectate.compat.claude"],
  ["Codex", false, "spectate.compat.codex"],
  ["Gemini CLI", false, "spectate.compat.gemini"],
  ["OpenCode", false, "spectate.compat.opencode"],
  ["Cursor CLI", false, "spectate.compat.cursor"],
];

export const compatView = (t: Translate, plugin: boolean): View => {
  const width = Math.max(...ROWS.map(([harness]) => widthOf(harness)));
  return [
    [span(` ${t("spectate.experimental")}`, "strong")],
    ...ROWS.map(([harness, full, key], index): View[number] => {
      const branch = index === ROWS.length - 1 ? "└─" : "├─";
      const words = key === "spectate.compat.opencode" && plugin ? t("spectate.compat.opencodePlugin") : t(key);
      return [
        span(` ${branch} `, "muted"),
        span(full ? "✓" : "!", full ? "success" : "warning"),
        span(` ${harness.padEnd(width)}  `),
        span(words, "muted"),
      ];
    }),
    [],
  ];
};
