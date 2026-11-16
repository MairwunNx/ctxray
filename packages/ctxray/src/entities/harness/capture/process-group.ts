import type { Subprocess } from "bun";

// A harness leaves helpers behind: Cursor CLI's workers and language servers outlive it and hold hundreds of
// megabytes each. On POSIX the harness leads a process group of its own, and ctxray ends the whole group once
// the session is over, or when ctxray itself exits. Windows has no process groups to end.
export const ownsGroup = process.platform !== "win32";

export const watchGroup = (child: Subprocess) => {
  const end = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  };
  if (ownsGroup) process.on("exit", end);
  return () => {
    if (!ownsGroup) return;
    process.off("exit", end);
    end();
  };
};
