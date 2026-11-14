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

// The example checks the project's own root rules file, so it passes on the first run.
export const testTemplate = (rulesFile: string): string => `import { expect, suite, test } from "@mairwunnx/ctxray";

suite("loadout", () => {
  test.resolve("${rulesFile} loads for every file", async ({ resolve }) => {
    const loadout = await resolve({ files: ["README.md"] });
    expect(loadout.rules).toInclude("${rulesFile}");
  });
});
`;
