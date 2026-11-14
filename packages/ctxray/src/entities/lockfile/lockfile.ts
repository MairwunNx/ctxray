import { dirname, join, resolve } from "node:path";
import {
  type HarnessId,
  type HarnessSettings,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  type LockedHarness,
  Lockfile,
} from "#shared/contract/index.ts";
import type { MessageKey, Params } from "#shared/i18n/index.ts";
import { PLATFORMS, platformKey } from "#shared/infra/index.ts";

// A new object each time: commands fill it in.
export const emptyLockfile = (): Lockfile => ({ lockfileVersion: LOCKFILE_VERSION, harnesses: {} });

// ctxray.lock sits next to the project's config, like bun.lock next to package.json. The config names its files
// relative to where ctxray runs.
export const lockfilePath = (configFiles: readonly string[], cwd: string) =>
  join(configFiles.length > 0 ? resolve(cwd, dirname(configFiles.at(-1) as string)) : cwd, LOCKFILE_NAME);

export type LockProblem = { key: MessageKey; params: Params };

export class LockfileFailure extends Error {
  readonly problem: LockProblem;
  constructor(problem: LockProblem) {
    super(problem.key);
    this.problem = problem;
  }
}

export const readLockfile = async (path: string): Promise<Lockfile | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (error) {
    throw new LockfileFailure({ key: "lock.unreadable", params: { file: path, message: (error as Error).message } });
  }
  const parsed = Lockfile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") ?? "";
    throw new LockfileFailure({ key: "lock.invalid", params: { file: path, where, message: issue?.message ?? "" } });
  }
  return parsed.data;
};

const ORDER = PLATFORMS.map(platformKey);

// Harnesses by name and platforms in a fixed order, so a lockfile changes only where a version did.
const stable = (locked: LockedHarness): LockedHarness =>
  locked.source === "system"
    ? locked
    : {
        ...locked,
        platforms: Object.fromEntries(
          Object.entries(locked.platforms).sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b)),
        ),
      };

export const formatLockfile = (lock: Lockfile) => {
  const harnesses = Object.entries(lock.harnesses)
    .filter((entry): entry is [string, LockedHarness] => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, locked]) => [id, stable(locked)]);
  return `${JSON.stringify({ lockfileVersion: lock.lockfileVersion, harnesses: Object.fromEntries(harnesses) }, null, 2)}\n`;
};

export const writeLockfile = (path: string, lock: Lockfile) => Bun.write(path, formatLockfile(lock));

// Where the lockfile and the config disagree. `--frozen` fails on any of these, a local run only mentions them.
export const lockProblems = (
  lock: Lockfile | undefined,
  harnesses: readonly HarnessId[],
  settingsOf: (harness: HarnessId) => HarnessSettings | undefined,
): LockProblem[] => {
  const problems: LockProblem[] = [];
  for (const harness of harnesses) {
    const settings = settingsOf(harness);
    const locked = lock?.harnesses[harness];
    const source = settings?.source ?? "registry";
    if (locked === undefined) {
      problems.push({ key: source === "system" ? "lock.missingSystem" : "lock.missing", params: { harness } });
    } else if (locked.source !== source) {
      problems.push({ key: "lock.sourceChanged", params: { harness, locked: locked.source, configured: source } });
    } else if (locked.source === "registry" && settings?.version !== undefined && settings.version !== locked.range) {
      problems.push({
        key: "lock.rangeChanged",
        params: { harness, locked: locked.range, configured: settings.version },
      });
    }
  }
  return problems;
};
