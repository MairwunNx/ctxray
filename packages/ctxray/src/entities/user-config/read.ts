import { extname } from "node:path";

// Looked for in the project root, in this order. Two of them at once is an error, not a silent pick.
export const CONFIG_FILES = ["ctxray.config.ts", "ctxray.config.jsonc", "ctxray.config.json"] as const;

const JSON_EXTENSIONS = new Set([".json", ".jsonc"]);

// What the file declares, not yet validated. A TypeScript config runs, so it may throw.
export const readConfigFile = async (file: string): Promise<unknown> => {
  if (JSON_EXTENSIONS.has(extname(file))) return Bun.JSONC.parse(await Bun.file(file).text());
  const module: { default?: unknown } = await import(file);
  return module.default;
};
