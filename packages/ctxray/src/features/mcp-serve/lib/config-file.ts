import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Target } from "./targets.ts";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const isToml = (file: string) => file.endsWith(".toml");

const parse = (file: string, text: string) => record(isToml(file) ? Bun.TOML.parse(text) : Bun.JSONC.parse(text));

// Whether the agent's config already names a server ctxray, whatever its command: then nothing changes.
export const hasCtxray = async ({ file, key }: Target) => {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return false;
  try {
    return "ctxray" in record(parse(file, await handle.text())[key]);
  } catch {
    return false;
  }
};

// The file's own indentation, so a rewrite changes only the lines ctxray adds.
const indentOf = (text: string) => /\n([ \t]+)\S/.exec(text)?.[1] ?? "  ";

export type Written = "written" | "comments";

// Adds ctxray under the key and keeps everything else. JSON with comments would lose them, so it stays as it is.
// TOML gets a table of its own appended: a new table at the end is valid whatever the file holds.
export const addCtxray = async ({ file, key, entry }: Target): Promise<Written> => {
  const handle = Bun.file(file);
  const text = (await handle.exists()) ? await handle.text() : "";
  await mkdir(dirname(file), { recursive: true });
  if (isToml(file)) {
    const table = [`[${key}.ctxray]`, `command = "${entry["command"]}"`, `args = ${JSON.stringify(entry["args"])}`];
    const gap = text === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    await Bun.write(file, `${text}${gap}${table.join("\n")}\n`);
    return "written";
  }
  let config: Record<string, unknown> = {};
  if (text.trim() !== "") {
    try {
      config = record(JSON.parse(text));
    } catch {
      return "comments";
    }
  }
  const next = { ...config, [key]: { ...record(config[key]), ctxray: entry } };
  await Bun.write(file, `${JSON.stringify(next, null, indentOf(text))}\n`);
  return "written";
};
