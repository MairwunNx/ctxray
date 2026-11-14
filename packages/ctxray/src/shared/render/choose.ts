import type { Env } from "../infra/index.ts";

export type RendererKind = "ink" | "plain";

export type Terminal = {
  tty: boolean; // stdout is a terminal
  ci: boolean; // --ci or a CI environment
  plain: boolean; // --plain or --no-color
  env: Env;
};

// https://no-color.org: NO_COLOR set to any non-empty value turns colour off.
const noColor = (env: Env): boolean => (env["NO_COLOR"] ?? "") !== "";

// Ink only where someone watches a capable terminal. Everything else gets lines it can stream.
export const chooseRenderer = ({ tty, ci, plain, env }: Terminal): RendererKind =>
  !tty || ci || plain || noColor(env) || env["TERM"] === "dumb" ? "plain" : "ink";
