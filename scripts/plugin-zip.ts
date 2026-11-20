// Packs ctxray's plugin for Claude Code into dist/ctxray-claude-plugin-<version>.zip, for machines that can't
// reach the marketplace: `claude --plugin-dir ctxray-claude-plugin.zip`, the release asset, loads it as it is.
import { $ } from "bun";

const PLUGIN = "packages/claude-plugin";
const { version } = (await Bun.file(`${PLUGIN}/.claude-plugin/plugin.json`).json()) as { version: string };
const out = `${process.cwd()}/dist/ctxray-claude-plugin-${version}.zip`;

await $`mkdir -p dist && rm -f ${out}`;
// -X leaves out file attributes that differ between machines, -D directory entries. Tests and the types
// Claude Code writes for editors stay out.
await $`zip -r -X -D -q ${out} . -x '*.DS_Store' '*.test.tsx' '.claude-plugin/types/*' 'tsconfig.json'`.cwd(PLUGIN);
console.log(out);
