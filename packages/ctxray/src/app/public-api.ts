// What `import … from "@mairwunnx/ctxray"` gives a user's config and test files. The binary serves this very
// module to them (ADR 0001), so their calls land in its state whatever node_modules holds.
export { defineConfig } from "#entities/user-config/index.ts";
export {
  corpus,
  discover,
  expect,
  type ResolvedLoadout,
  type ResolveRequest,
  type Rule,
  type RuleSelector,
  type RuleSet,
  type SuiteOptions,
  suite,
  type TestOptions,
  test,
} from "#features/test-run/index.ts";
