// Stable across releases: scripts and CI pipelines branch on these numbers. The wiki documents them.
export const ExitCode = {
  ok: 0, // everything passed
  failed: 1, // a test or a check failed
  usage: 2, // an unknown command, flag, or argument
  config: 3, // the config is missing or invalid
  environment: 4, // a harness, the network, or the file system let the run down
  internal: 5, // a bug in ctxray
  interrupted: 130, // Ctrl-C or SIGINT
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
