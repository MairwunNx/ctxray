import { plugin } from "bun";
import * as api from "./public-api.ts";

// Runs before ctxray imports any user file. `build.module` is the one hook that wins over node_modules,
// `onResolve` never sees scoped bare specifiers (ADR 0001).
export const registerUserModules = () =>
  plugin({
    name: "ctxray-api",
    setup(build) {
      build.module("@mairwunnx/ctxray", () => ({ exports: { ...api }, loader: "object" }));
    },
  });
