// What a harness can do, as far as ctxray tests are concerned. A test lists what it `requires`, and a harness
// without one of them reports `skipped: unsupported` instead of failing.
export const CAPABILITIES = [
  "skills", // skills listed by description, loaded on demand
  "pathRules", // rules or nested context files that load when the agent works with matching files
  "intentRules", // rules (not skills) the model picks by their description
  "mcp", // MCP servers and their tools
  "hooks", // lifecycle hooks ctxray can observe through
  "headless", // runs without a UI, so ctxray can launch it
  "proxyable", // sends its model requests to a base URL ctxray sets
] as const;

export type Capability = (typeof CAPABILITIES)[number];
