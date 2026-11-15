import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Providers change the tokens they add on their side, so a count goes stale after 30 days (ADR 0012).
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export type CountCache = {
  get: (key: string) => number | undefined;
  set: (key: string, tokens: number) => void;
  close: () => void;
};

// Exact counts by the hash of what was counted: a second run on the same loadout asks the provider nothing.
export const openCountCache = (file: string, now: () => number = Date.now): CountCache => {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(
    "CREATE TABLE IF NOT EXISTS counts (key TEXT PRIMARY KEY, tokens INTEGER NOT NULL, counted_at INTEGER NOT NULL)",
  );
  const select = db.query<{ tokens: number; counted_at: number }, [string]>(
    "SELECT tokens, counted_at FROM counts WHERE key = ?",
  );
  const upsert = db.query("INSERT OR REPLACE INTO counts (key, tokens, counted_at) VALUES (?, ?, ?)");
  return {
    get: (key) => {
      const row = select.get(key);
      return row && now() - row.counted_at < MAX_AGE ? row.tokens : undefined;
    },
    set: (key, tokens) => {
      upsert.run(key, tokens, now());
    },
    close: () => db.close(),
  };
};

export const memoryCountCache = (): CountCache => {
  const counts = new Map<string, number>();
  return { get: (key) => counts.get(key), set: (key, tokens) => counts.set(key, tokens), close: () => {} };
};
