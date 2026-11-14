import { defineConfig } from "@mairwunnx/ctxray";

export default defineConfig({
  harnesses: { "claude-code": {}, codex: {} },
  policies: [{ id: "agents-md", requireFiles: ["payments/AGENTS.md"] }],
});
