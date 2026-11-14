import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Exchange, Step } from "#shared/contract/index.ts";
import { readShimLog, type ServerRecord } from "#shared/mcp-shim/index.ts";
import type { Inventory } from "../inventory.ts";
import { isolate, type ProjectCopy, type RunDirs } from "./isolate.ts";
import { type McpRouting, type RemoteMcp, routeMcp } from "./mcp.ts";
import type { CaptureAdapter, Intent } from "./model.ts";
import { sandboxed } from "./sandbox.ts";
import type { UserScope } from "./user-scope.ts";

// The mock model a session talks to, as the proxy provides it.
export type ModelPort = {
  baseUrl: string;
  turn: (position: number) => Promise<Exchange>;
  answer: (position: number, step: Step) => void;
  finish: (step: Step) => void;
  close: () => void;
};

export type SessionOptions = {
  adapter: CaptureAdapter;
  binary: string;
  copy: ProjectCopy; // the committed project copy from createCopy(), cloned for this session
  inventory: Inventory;
  cwd: string;
  prompt: string;
  model: string;
  env: Record<string, string>; // isolation, without HOME and TMPDIR: the session adds its own
  mcp: McpRouting; // how to run ctxray itself for the shim, and the server's environment
  port: ModelPort;
  remoteMcp: RemoteMcp;
  timeout: number; // milliseconds a harness may take for one turn
  user?: UserScope | undefined; // `userScope: "inherit"`
};

export class HarnessExit extends Error {
  readonly code: number | null;
  readonly output: string;
  constructor(code: number | null, output: string) {
    super(`harness exited with ${code}`);
    this.code = code;
    this.output = output;
  }
}

export type SessionResult = { servers: Record<string, ServerRecord>; output: string; code: number | null };

export type HarnessSession = {
  dirs: RunDirs;
  version: string;
  aliases: ProjectCopy["aliases"];
  request: (position: number) => Promise<Exchange>; // waits for the turn, fails when the harness gives up
  servers: () => Promise<Record<string, ServerRecord>>; // what each MCP server told the harness so far
  events: () => readonly unknown[]; // the harness's own JSON events so far
  say: (position: number, intent: Intent | Step) => Promise<void>;
  end: () => Promise<SessionResult>;
};

const tail = (text: string, lines = 20) => text.trim().split("\n").slice(-lines).join("\n");

// Launches the harness on an isolated copy of the project, pointed at the mock model.
export const startSession = async (options: SessionOptions): Promise<HarnessSession> => {
  const { adapter, port } = options;
  const dirs = await isolate(options.copy);
  // XDG folders under the run's HOME too: a harness that reads them never sees the user's.
  const env = {
    ...options.env,
    PATH: `${dirs.bin}:${options.env["PATH"] ?? ""}`,
    HOME: dirs.home,
    TMPDIR: dirs.tmp,
    XDG_CONFIG_HOME: join(dirs.home, ".config"),
    XDG_CACHE_HOME: join(dirs.home, ".cache"),
    XDG_DATA_HOME: join(dirs.home, ".local", "share"),
    XDG_STATE_HOME: join(dirs.home, ".local", "state"),
  };
  const version = await adapter.version(options.binary, env);
  const { shim, remote, close: closeRemotes } = routeMcp(dirs, options.mcp, options.remoteMcp);
  const context = {
    dirs,
    cwd: options.cwd,
    prompt: options.prompt,
    model: options.model,
    baseUrl: port.baseUrl,
    env,
    shim,
    remote,
    user: options.user,
  };
  const launch = await adapter.launch(options.binary, context, options.inventory);
  const command = adapter.sandboxesItself ? launch.command : sandboxed(launch.command, dirs.root);
  const child = Bun.spawn(command, {
    cwd: join(dirs.work, options.cwd),
    env: launch.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  // Headless harnesses print JSON events, one per line: Claude Code's stream-json, Codex's --json.
  const lines: string[] = [];
  const events: unknown[] = [];
  const reading = (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout) {
      rest += decoder.decode(chunk, { stream: true });
      for (let end = rest.indexOf("\n"); end !== -1; end = rest.indexOf("\n")) {
        const line = rest.slice(0, end);
        rest = rest.slice(end + 1);
        lines.push(line);
        try {
          events.push(JSON.parse(line));
        } catch {}
      }
    }
    if (rest !== "") lines.push(rest);
  })();
  const output = Promise.all([reading, new Response(child.stderr).text()]).then(
    ([, stderr]) => `${lines.join("\n")}\n${stderr}`,
  );
  const exited = child.exited.then(async (code) => new HarnessExit(code, tail(await output)));

  const request = async (position: number) => {
    let timer: Timer | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HarnessExit(null, "timeout")), options.timeout);
    });
    try {
      return await Promise.race([port.turn(position), exited.then((exit) => Promise.reject(exit)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  const servers = async () => {
    const records: Record<string, ServerRecord> = {};
    for (const file of (await readdir(dirs.logs)).filter((name) => name.endsWith(".jsonl"))) {
      records[basename(file, ".jsonl")] = readShimLog(await readFile(join(dirs.logs, file), "utf8"));
    }
    return records;
  };

  return {
    dirs,
    version,
    aliases: options.copy.aliases,
    request,
    servers,
    events: () => events,
    say: async (position, said) => {
      const step = "tool" in said ? { call: adapter.call(said, dirs.work, await request(position)) } : said;
      port.answer(position, step);
    },
    end: async () => {
      port.finish({ text: "done" });
      const stop = setTimeout(() => child.kill("SIGKILL"), options.timeout);
      const code = await child.exited;
      clearTimeout(stop);
      port.close();
      closeRemotes();
      const records = await servers();
      const text = tail(await output, 40);
      await rm(dirs.root, { recursive: true, force: true });
      return { servers: records, output: text, code };
    },
  };
};
