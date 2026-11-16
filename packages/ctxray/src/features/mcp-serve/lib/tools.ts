// The tools ctxray offers an agent over MCP. Their descriptions go to the model, not to a person, so they stay
// in English like a skill's body. Each one runs a ctxray command and hands back what it prints.
export const TOOLS = [
  {
    name: "inspect",
    description:
      "What an agent harness loads in this project before any work: rules, skills, MCP servers, commands, and " +
      "their tokens. Reads files only, launches nothing.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Folder the agent starts in, relative to the project root" },
        files: { type: "array", items: { type: "string" }, description: "Files the agent works with" },
        harness: { type: "string", description: "Harness ids, comma-separated, like claude-code,codex" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run",
    description:
      "Run the project's ctxray tests (*.ctxray.ts) and report what failed. L1 to L3 read files only, L4 and up " +
      "launch the harness against a mock model, which takes longer.",
    inputSchema: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Layers to run, like L1,L2,L3" },
        filter: { type: "string", description: "Run only the tests whose name contains this" },
        harness: { type: "string", description: "Harness ids, comma-separated" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "diff",
    description:
      "How the loadout changed since a git revision: tokens by component, and the rules, skills, and MCP " +
      "servers that came or went. Use it to check a change didn't bloat the context.",
    inputSchema: {
      type: "object",
      properties: {
        base: { type: "string", description: "Git revision to compare with, like main or HEAD~1" },
        harness: { type: "string", description: "Harness ids, comma-separated" },
      },
      required: ["base"],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);
const flag = (name: string, value: unknown) => {
  const given = text(value);
  return given === undefined ? [] : [`--${name}`, given];
};

// The command line of a tool call, or undefined for a tool ctxray doesn't have. The server's own `--harness`
// stands in when a call names none.
export const argsOf = (name: string, input: Record<string, unknown>, harness: string | undefined) => {
  const harnesses = flag("harness", input["harness"] ?? harness);
  const files = Array.isArray(input["files"]) ? input["files"].filter((one) => typeof one === "string") : [];
  switch (name) {
    case "inspect":
      return ["inspect", ...flag("cwd", input["cwd"]), ...flag("files", files.join(",")), ...harnesses];
    case "run":
      return ["test", ...flag("layer", input["layer"]), ...flag("filter", input["filter"]), ...harnesses];
    case "diff":
      return text(input["base"]) ? ["diff", ...flag("base", input["base"]), ...harnesses] : undefined;
    default:
      return undefined;
  }
};
