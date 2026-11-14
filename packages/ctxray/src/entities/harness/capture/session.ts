import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Exchange, Step } from "#shared/contract/index.ts";
import { readShimLog, type ServerRecord, type ShimConfig } from "#shared/mcp-shim/index.ts";
import type { Inventory } from "../inventory.ts";
import type { Project } from "../project.ts";
import type { RunDirs } from "./isolate.ts";
import { isolate } from "./isolate.ts";
import type { CaptureAdapter, Intent } from "./model.ts";

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
  project: Project;
  inventory: Inventory;
  cwd: string;
  prompt: string;
  model: string;
  env: Record<string, string>; // isolation, without HOME and TMPDIR: the session adds its own
  self: readonly string[]; // how to run ctxray itself, for the MCP shim
  shimEnv: Pick<ShimConfig, "env" | "unset" | "patterns">;
  port: ModelPort;
  timeout: number; // milliseconds a harness may take for one turn
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
  request: (position: number) => Promise<Exchange>; // waits for the turn, fails when the harness gives up
  servers: () => Promise<Record<string, ServerRecord>>; // what each MCP server told the harness so far
  say: (position: number, intent: Intent | Step) => Promise<void>;
  end: () => Promise<SessionResult>;
};

const tail = (text: string, lines = 20) => text.trim().split("\n").slice(-lines).join("\n");

// Launches the harness on an isolated copy of the project, pointed at the mock model.
export const startSession = async (options: SessionOptions): Promise<HarnessSession> => {
  const { adapter, port } = options;
  const canaries = new Set([
    ...options.inventory.instructions.map((file) => file.path),
    ...options.inventory.skills.map((skill) => skill.path),
    ...options.inventory.commands.map((command) => command.path),
  ]);
  const dirs = await isolate(options.project, canaries);
  const env = { ...options.env, PATH: `${dirs.bin}:${options.env["PATH"] ?? ""}`, HOME: dirs.home, TMPDIR: dirs.tmp };
  const version = await adapter.version(options.binary, env);
  const shim = async (name: string, command: readonly string[]) => {
    const config = join(dirs.logs, `${name}.shim.json`);
    await Bun.write(config, JSON.stringify({ ...options.shimEnv, log: join(dirs.logs, `${name}.jsonl`) }));
    return [...options.self, "__mcp-shim", config, "--", ...command];
  };
  const context = {
    dirs,
    cwd: options.cwd,
    prompt: options.prompt,
    model: options.model,
    baseUrl: port.baseUrl,
    env,
    shim,
  };
  const launch = await adapter.launch(options.binary, context, options.inventory);
  const child = Bun.spawn(launch.command, {
    cwd: join(dirs.work, options.cwd),
    env: launch.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]).then(
    ([stdout, stderr]) => `${stdout}\n${stderr}`,
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
    request,
    servers,
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
      const records = await servers();
      const text = tail(await output, 40);
      await rm(dirs.root, { recursive: true, force: true });
      return { servers: records, output: text, code };
    },
  };
};
