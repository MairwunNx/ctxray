export const CONFIG_PATH = "ctxray.config.ts";
export const TEST_PATH = "ctxray/loadout.ctxray.ts";

export const CONFIG_TEMPLATE = `import { defineConfig } from "@mairwunnx/ctxray";

export default defineConfig({
  harnesses: {
    "claude-code": {},
    codex: {},
  },
});
`;

// Each harness reads its own root rules file: Claude Code doesn't read AGENTS.md, Codex doesn't read CLAUDE.md.
export const TEST_TEMPLATE = `import { expect, suite, test } from "@mairwunnx/ctxray";

// The root rules file each harness reads.
const rootRules: Record<string, string> = { "claude-code": "CLAUDE.md", codex: "AGENTS.md" };

suite("loadout", () => {
  test.resolve("the root rules file loads for every file", async ({ harness, resolve }) => {
    const loadout = await resolve({ files: ["README.md"] });
    expect(loadout.rules).toInclude(rootRules[harness]);
  });
});
`;
