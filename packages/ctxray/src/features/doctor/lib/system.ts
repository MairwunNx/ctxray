import { stat } from "node:fs/promises";
import { $ } from "bun";
import type { Env } from "#shared/infra/index.ts";
import { check, type DoctorCheck } from "./model.ts";

const versionOf = async (command: string, env: Env) => {
  const binary = Bun.which(command, { PATH: env["PATH"] ?? "" });
  if (binary === null) return undefined;
  const output = await $`${binary} --version`.quiet().nothrow().text();
  return /\d+\.\d+(\.\d+)?/.exec(output)?.[0] ?? output.trim();
};

// Settings an administrator put where no environment variable reaches: they apply to every run (ADR 0005, 0006).
const MANAGED: Record<string, readonly string[]> = {
  darwin: ["/Library/Application Support/ClaudeCode", "/etc/codex"],
  linux: ["/etc/claude-code", "/etc/codex"],
  win32: ["C:\\Program Files\\ClaudeCode", "C:\\ProgramData\\codex"],
};

export const systemChecks = async (env: Env, os: string = process.platform): Promise<DoctorCheck[]> => {
  const git = await versionOf("git", env);
  const node = await versionOf("node", env);
  const checks = [
    git === undefined ? check("error", "doctor.noGit") : check("ok", "doctor.git", { version: git }),
    node === undefined ? check("info", "doctor.noNode") : check("ok", "doctor.node", { version: node }),
  ];
  for (const path of MANAGED[os] ?? []) {
    if (await stat(path).catch(() => undefined)) checks.push(check("warning", "doctor.managed", { path }));
  }
  // macOS runs harnesses under sandbox-exec. Elsewhere the container of the CI job is the sandbox.
  if (os === "darwin") {
    checks.push(Bun.which("sandbox-exec") ? check("ok", "doctor.sandbox") : check("warning", "doctor.noSandbox"));
  } else {
    checks.push(check("info", "doctor.containerSandbox"));
  }
  return checks;
};
