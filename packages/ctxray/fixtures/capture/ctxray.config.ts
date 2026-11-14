import { defineConfig } from "@mairwunnx/ctxray";

export default defineConfig({
  harnesses: { "claude-code": {}, codex: {}, "gemini-cli": {}, opencode: {}, "cursor-cli": { experimental: true } },
});
