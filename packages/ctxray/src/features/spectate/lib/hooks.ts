import { FAMILIES, type Family } from "./places.ts";

// ctxray's hook is the one whose command runs `__spectate-hook`: that's how uninstall finds it again.
export const MARK = "__spectate-hook";

type Json = Record<string, unknown>;

const record = (value: unknown): Json =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Claude Code nests a command in a matcher group, Cursor lists commands straight away.
const entryOf = (family: Family, command: string): Json =>
  family === "claude" ? { hooks: [{ type: "command", command }] } : { command };

const isOurs = (entry: unknown) => JSON.stringify(entry).includes(MARK);

// The file with ctxray's hook added to every event it observes, and the events that got one. Whatever the user
// had stays as it was, and an event that already has ctxray's hook keeps the one it has.
export const addHooks = (family: Family, file: Json, command: string): { file: Json; added: string[] } => {
  const hooks = { ...record(file["hooks"]) };
  const added: string[] = [];
  for (const event of FAMILIES[family].events) {
    const entries = list(hooks[event]);
    if (entries.some(isOurs)) continue;
    hooks[event] = [...entries, entryOf(family, command)];
    added.push(event);
  }
  const version = family === "cursor" ? { version: file["version"] ?? 1 } : {};
  return { file: { ...file, ...version, hooks }, added };
};

// The file without ctxray's hooks, and the events that lost one. An event left empty goes too.
export const removeHooks = (file: Json): { file: Json; removed: string[] } => {
  const hooks: Json = {};
  const removed: string[] = [];
  for (const [event, value] of Object.entries(record(file["hooks"]))) {
    const entries = list(value);
    const kept = entries.filter((entry) => !isOurs(entry));
    if (kept.length < entries.length) removed.push(event);
    if (kept.length > 0) hooks[event] = kept;
  }
  const { hooks: _, ...rest } = file;
  return { file: Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest, removed };
};
