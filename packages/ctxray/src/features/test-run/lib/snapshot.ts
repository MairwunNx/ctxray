import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { StaticLoadout } from "#entities/harness/index.ts";
import { type FailureLine, fail } from "./failure.ts";

// Keyed by name, not position: one new rule reads as one added line, not a shifted list.
export const snapshotOf = (loadout: StaticLoadout) => ({
  rules: Object.fromEntries(
    loadout.rules.map(({ path, activation, reason, tokens }) => [path, { activation, reason, tokens }]),
  ),
  skills: Object.fromEntries(loadout.skills.listed.map(({ name, path, tokens }) => [name, { path, tokens }])),
  mcp: loadout.mcp.servers.map(({ name }) => name),
  commands: loadout.commands.map(({ name }) => name),
  tokens: { ...loadout.tokens.byComponent, method: loadout.tokens.method },
});

// A loadout view carries helper functions, so it keeps its snapshot value apart: what toMatchLoadoutSnapshot
// stores, and the variant of the key, `static` or `<version> <model>` for a captured one.
const attached = new WeakMap<object, { value: unknown; variant: string }>();

export const attachSnapshot = <T extends object>(view: T, value: unknown, variant: string): T => {
  attached.set(view, { value, variant });
  return view;
};

export const attachedSnapshot = (view: unknown) =>
  typeof view === "object" && view !== null ? attached.get(view) : undefined;

// The harness and its version are part of the key: an upgrade changes the loadout by itself. A static run
// reads files only, so its version is `static`.
export const snapshotKey = (test: string, harness: string, version = "static") => `${test} › ${harness}@${version}`;

export const snapshotFile = (testFile: string) =>
  join(dirname(testFile), "__snapshots__", `${basename(testFile).replace(/\.[mc]?[jt]s$/, "")}.snap.json`);

type Values = Record<string, unknown>;

const flatten = (value: unknown, path: string, into: Map<string, string>) => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) flatten(inner, path === "" ? key : `${path} › ${key}`, into);
  } else into.set(path, JSON.stringify(value));
  return into;
};

const SHOWN = 8;

// What changed, one line per value: `rules › CLAUDE.md › tokens  37 → 41`.
export const describeChange = (before: unknown, after: unknown): FailureLine[] => {
  const old = flatten(before, "", new Map());
  const now = flatten(after, "", new Map());
  const paths = [...new Set([...old.keys(), ...now.keys()])].filter((path) => old.get(path) !== now.get(path));
  const lines = paths.slice(0, SHOWN).map(
    (path): FailureLine => ({
      label: "snapshot.changed",
      value: `${path}  ${old.get(path) ?? "—"} → ${now.get(path) ?? "—"}`,
    }),
  );
  return paths.length > SHOWN ? [...lines, { label: "snapshot.more", value: String(paths.length - SHOWN) }] : lines;
};

export type SnapshotStats = { written: number; updated: number };

// Snapshots live next to the test file. Only --update-snapshots writes them: a test run leaves the user's
// files alone otherwise, so a missing snapshot fails with a hint.
export const createSnapshots = (update: boolean) => {
  const files = new Map<string, Values>();
  const changed = new Set<string>();
  const stats: SnapshotStats = { written: 0, updated: 0 };

  const load = async (testFile: string) => {
    const file = snapshotFile(testFile);
    if (files.has(file)) return;
    const handle = Bun.file(file);
    files.set(file, (await handle.exists()) ? ((await handle.json()) as Values) : {});
  };

  const check = (testFile: string, key: string, value: unknown) => {
    const file = snapshotFile(testFile);
    const stored = files.get(file) ?? {};
    const before = stored[key];
    if (before !== undefined && Bun.deepEquals(before, value)) return;
    if (!update) {
      if (before === undefined) fail("snapshot.missing", { key });
      fail("snapshot.mismatch", { key }, describeChange(before, value));
    }
    stored[key] = value;
    files.set(file, stored);
    changed.add(file);
    if (before === undefined) stats.written++;
    else stats.updated++;
  };

  const sorted = (values: Values) => Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));

  const save = async () => {
    for (const file of changed) {
      await mkdir(dirname(file), { recursive: true });
      await Bun.write(file, `${JSON.stringify(sorted(files.get(file) ?? {}), null, 2)}\n`);
    }
    return stats;
  };

  return { load, check, save };
};
export type Snapshots = ReturnType<typeof createSnapshots>;
