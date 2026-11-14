import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type HooksFile = { exists: boolean; json: Record<string, unknown> } | { error: string };

// A settings file as it is. One ctxray can't read stays untouched: overwriting it would lose the user's settings.
export const readHooksFile = async (path: string): Promise<HooksFile> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return { exists: false, json: {} };
  try {
    const json = Bun.JSONC.parse(await file.text());
    if (typeof json !== "object" || json === null || Array.isArray(json)) return { error: "not an object" };
    return { exists: true, json: json as Record<string, unknown> };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export const writeHooksFile = async (path: string, json: Record<string, unknown>) => {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(json, null, 2)}\n`);
};
