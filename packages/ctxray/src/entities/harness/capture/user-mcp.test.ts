import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "#shared/contract/index.ts";
import { launchClaudeCode } from "../claude-code/launch.ts";
import { launchCodex } from "../codex/launch.ts";
import { routeEntry } from "./mcp-route.ts";
import type { LaunchContext } from "./model.ts";
import { readUserMcp, userMcpFile } from "./user-mcp.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ctxray-user-mcp-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const routing = {
  shim: async (name: string, command: readonly string[]) => ["ctxray", "__mcp-shim", name, "--", ...command],
  remote: (name: string, url: string) => `http://127.0.0.1:1/m/${name}?to=${url}`,
};

describe("routeEntry", () => {
  test.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    [
      "a command and its args, with the rest kept",
      { command: "npx", args: ["-y", "server"], env: { TOKEN: "x" } },
      { command: "ctxray", args: ["__mcp-shim", "s", "--", "npx", "-y", "server"], env: { TOKEN: "x" } },
    ],
    [
      "OpenCode's command array",
      { type: "local", command: ["bun", "server.ts"] },
      { type: "local", command: ["ctxray", "__mcp-shim", "s", "--", "bun", "server.ts"] },
    ],
    [
      "a remote server",
      { url: "https://mcp.corp/sse", headers: { a: "b" } },
      { url: "http://127.0.0.1:1/m/s?to=https://mcp.corp/sse", headers: { a: "b" } },
    ],
    [
      "Gemini CLI's httpUrl",
      { httpUrl: "https://mcp.corp" },
      { httpUrl: "http://127.0.0.1:1/m/s?to=https://mcp.corp" },
    ],
  ])("%s", async (_, entry, expected) => {
    expect(await routeEntry(routing, "s", entry)).toEqual(expected);
  });
});

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

describe("the user's MCP servers of every harness", () => {
  const home = join(root, "home");
  const scope = { home, env: { XDG_CONFIG_HOME: join(root, "xdg") }, project: join(root, "repo") };
  mkdirSync(join(root, "repo", "app"), { recursive: true });
  write(userMcpFile("cursor-cli", scope), '{"mcpServers":{"linear":{"url":"https://mcp.linear.app/sse"}}}');
  write(userMcpFile("gemini-cli", scope), '{"theme":"x","mcpServers":{"fs":{"command":"npx","args":["fs"]}}}');
  write(userMcpFile("opencode", scope), '{"mcp":{"db":{"type":"local","command":["db-mcp"]}}}');
  write(userMcpFile("codex", scope), '[mcp_servers."a.b"]\ncommand = "x"\n');
  write(
    userMcpFile("claude-code", scope),
    JSON.stringify({
      mcpServers: { global: { command: "g" } },
      projects: {
        [join(root, "repo")]: { mcpServers: { here: { command: "h" } } },
        [join(root, "repo", "app")]: { mcpServers: { app: { command: "a" } } },
        [join(root, "other")]: { mcpServers: { there: { command: "t" } } },
      },
    }),
  );

  test.each<[HarnessId, string[]]>([
    ["cursor-cli", ["linear"]],
    ["cursor-ide", ["linear"]],
    ["gemini-cli", ["fs"]],
    ["opencode", ["db"]],
    ["codex", ["a.b"]],
    ["claude-code", ["global"]],
    ["claude-code-desktop", []],
  ])("%s", async (harness, names) => {
    const { servers } = await readUserMcp(harness, scope, { from: scope.project, to: "/run/work" });
    expect(Object.keys(servers)).toEqual(names);
  });

  test("Claude Code's servers of this project move to the copy, other projects' stay out", async () => {
    const { projects } = await readUserMcp("claude-code", scope, { from: scope.project, to: "/run/work" });
    expect(Object.keys(projects)).toEqual(["/run/work", "/run/work/app"]);
  });

  test("a file the harness couldn't parse either gives nothing", async () => {
    write(join(root, "broken", ".cursor", "mcp.json"), "{");
    const broken = { home: join(root, "broken"), env: {}, project: scope.project };
    expect(await readUserMcp("cursor-cli", broken, { from: "", to: "" })).toEqual({ servers: {}, projects: {} });
  });
});

describe("the launchers", () => {
  const home = join(root, "launch-home");
  write(join(home, ".claude.json"), JSON.stringify({ mcpServers: { global: { command: "g", args: ["1"] } } }));
  write(
    join(home, ".claude", "settings.json"),
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: "x" }, hooks: { Stop: [] } }),
  );
  write(join(home, ".codex", "config.toml"), '[mcp_servers."a.b"]\ncommand = "x"\nenv = { K = "v" }\n');
  const context = (name: string): LaunchContext => {
    const dirs = {
      root: join(root, name),
      work: join(root, name, "work"),
      home: join(root, name, "home"),
      tmp: "",
      bin: "",
      logs: "",
    };
    mkdirSync(dirs.work, { recursive: true });
    return {
      dirs,
      cwd: "",
      prompt: "",
      model: "m",
      baseUrl: "",
      env: {},
      ...routing,
      user: { home, env: {}, project: join(root, "repo") },
    };
  };

  test("Claude Code gets the servers behind the shim and the hooks without the rest of the settings", async () => {
    const { env } = await launchClaudeCode("claude", context("claude"));
    const config = env["CLAUDE_CONFIG_DIR"] ?? "";
    expect(await Bun.file(join(config, ".claude.json")).json()).toEqual({
      mcpServers: { global: { command: "ctxray", args: ["__mcp-shim", "global", "--", "g", "1"] } },
      projects: {},
    });
    expect(await Bun.file(join(config, "settings.json")).json()).toEqual({ hooks: { Stop: [] } });
  });

  test("Codex gets them as tables of its config, a dotted name included", async () => {
    const { env } = await launchCodex("codex", context("codex"));
    const config = Bun.TOML.parse(await Bun.file(join(env["CODEX_HOME"] ?? "", "config.toml")).text()) as {
      mcp_servers: Record<string, unknown>;
      model_provider: string;
    };
    expect(config.model_provider).toBe("ctxray");
    expect(config.mcp_servers).toEqual({
      "a.b": {
        command: "ctxray",
        args: ["__mcp-shim", "a.b", "--", "x"],
        env: { K: "v" },
        default_tools_approval_mode: "approve",
      },
    });
  });
});
