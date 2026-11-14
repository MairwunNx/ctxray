import { mkdir, rename, rm, stat, utimes } from "node:fs/promises";

export type LockOptions = {
  stale?: number; // ms without a heartbeat after which the holder counts as dead
  poll?: number; // ms between attempts
  onWait?: () => void; // once, when another process holds the lock
};

const code = (error: unknown) => (error as NodeJS.ErrnoException).code;

// A lock between processes: whoever creates the directory holds it. The holder touches it while it works, so
// a lock left by a killed process goes stale and the next one takes it over.
export const withFileLock = async <T>(path: string, work: () => Promise<T>, options: LockOptions = {}) => {
  const { stale = 120_000, poll = 100, onWait } = options;
  let waited = false;
  for (;;) {
    try {
      await mkdir(path);
      break;
    } catch (error) {
      if (code(error) !== "EEXIST") throw error;
    }
    const held = await stat(path).catch(() => undefined);
    if (held && Date.now() - held.mtimeMs > stale) {
      // Renamed first, so of two processes that found it stale only one removes it.
      const dead = `${path}.stale-${crypto.randomUUID().slice(0, 8)}`;
      if (
        await rename(path, dead).then(
          () => true,
          () => false,
        )
      )
        await rm(dead, { recursive: true, force: true });
      continue;
    }
    if (!waited) onWait?.();
    waited = true;
    await Bun.sleep(poll);
  }
  const beat = setInterval(() => {
    const now = new Date();
    utimes(path, now, now).catch(() => {});
  }, stale / 4);
  try {
    return await work();
  } finally {
    clearInterval(beat);
    await rm(path, { recursive: true, force: true });
  }
};
