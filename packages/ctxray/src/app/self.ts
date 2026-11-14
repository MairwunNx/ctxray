import { join } from "node:path";

// How ctxray runs itself, for the MCP shim it puts in front of a harness's servers. The compiled binary is
// one file, the npm package and development run main.ts through Bun.
const compiled = Bun.main.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/.test(Bun.main);

export const SELF: readonly string[] = compiled
  ? [process.execPath]
  : [process.execPath, join(import.meta.dir, "main.ts")];
