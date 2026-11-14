// A harness run executes the project's code: MCP servers and hooks start without asking in headless mode
// (ADR 0013). On macOS ctxray confines the run's writes to its own folder with sandbox-exec. Elsewhere the
// container CI runs in is the sandbox.
const quote = (path: string) => JSON.stringify(path);

export const sandboxProfile = (root: string) =>
  [
    "(version 1)",
    "(allow default)",
    "(deny file-write*",
    `  (require-not (require-any (subpath ${quote(root)}) (subpath "/private/tmp") (subpath "/dev"))))`,
  ].join("\n");

// macOS refuses a sandbox inside a sandbox, so a harness that sandboxes its own commands, like Codex, runs
// without this one.
export const sandboxed = (command: readonly string[], root: string, platform = process.platform): string[] => {
  const tool = platform === "darwin" ? Bun.which("sandbox-exec") : null;
  return tool ? [tool, "-p", sandboxProfile(root), ...command] : [...command];
};
