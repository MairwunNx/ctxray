// What `import … from "@mairwunnx/ctxray"` gives a user's config and test files. The binary serves this very
// module to them (ADR 0001), so their calls land in its state whatever node_modules holds.
export { defineConfig } from "#entities/user-config/index.ts";
