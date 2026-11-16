// The types `import … from "@mairwunnx/ctxray"` gives an editor: tsc's declarations of the public API and of
// everything they reach, nothing else. The npm package keeps them under types/ with the same `#app/*`-style
// aliases, and the `.ts` in import paths becomes `.js`, which TypeScript resolves to the `.d.ts` next to it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";

const PACKAGE = "packages/ctxray";
const ENTRY = "app/public-api.d.ts";
const SPECIFIER = /((?:from|import\()\s*")([^"\s]+)(")/g;

// `#entities/*` → `./src/entities/*`, the package's own aliases.
const aliasesOf = async () =>
  Object.entries((await Bun.file(`${PACKAGE}/package.json`).json()).imports as Record<string, string>)
    .filter(([, target]) => target.startsWith("./src/"))
    .map(([alias, target]) => [alias.replace("*", ""), target.replace("./src/", "").replace("*", "")] as const);

// Every declaration file the entry reaches, relative to src, and the packages outside ctxray they import.
const closureOf = async (root: string, aliases: readonly (readonly [string, string])[]) => {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [ENTRY];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const [, , specifier = ""] of (await Bun.file(join(root, file)).text()).matchAll(SPECIFIER)) {
      const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
      const local = alias
        ? alias[1] + specifier.slice(alias[0].length)
        : specifier.startsWith(".")
          ? join(dirname(file), specifier)
          : undefined;
      if (local === undefined) external.add(specifier);
      else queue.push(local.replace(/\.ts$/, ".d.ts"));
    }
  }
  return { files: [...files].sort(), external: [...external].sort() };
};

// Writes the declarations into `out` and returns the aliases for package.json and the packages they import.
export const emitTypes = async (out: string) => {
  const temp = await mkdtemp(join(tmpdir(), "ctxray-types-"));
  try {
    await $`bunx tsc -p . --declaration --emitDeclarationOnly --noEmit false --outDir ${temp}`.quiet();
    const root = join(temp, PACKAGE, "src");
    const aliases = await aliasesOf();
    const { files, external } = await closureOf(root, aliases);
    const node = new Set<string>();
    for (const file of files) {
      const text = await Bun.file(join(root, file)).text();
      for (const [, name = ""] of text.matchAll(/\bNodeJS\.(\w+)/g)) node.add(name);
      const rewritten = text.replace(SPECIFIER, (_, head, specifier: string, tail) => {
        return head + specifier.replace(/\.ts$/, ".js") + tail;
      });
      await Bun.write(
        join(out, file),
        file === ENTRY ? `/// <reference path="./globals.d.ts" />\n${rewritten}` : rewritten,
      );
    }
    // A few internal signatures name Node's stream types. Without @types/node in the user's project they'd fail
    // the check, so empty interfaces stand in for them, and merge into Node's own when it's there.
    const shims = [...node].sort().map((name) => `  interface ${name} {}\n`);
    await Bun.write(join(out, dirname(ENTRY), "globals.d.ts"), `declare namespace NodeJS {\n${shims.join("")}}\n`);
    const imports = Object.fromEntries(aliases.map(([alias, dir]) => [`${alias}*`, `./types/${dir}*`]));
    return { entry: `./types/${ENTRY}`, imports, external, count: files.length };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
};
