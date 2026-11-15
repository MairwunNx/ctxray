import { relative } from "node:path";
import { CAPTURE_ADAPTERS, findRoot, openProject, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import { askModel } from "#entities/proxy/index.ts";
import { type Config, egressOf, resolveNetwork } from "#entities/user-config/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Env } from "#shared/infra/index.ts";
import { type Generated, parseGenerated, questionFor } from "./lib/prompt.ts";
import { type Target, targetsOf } from "./lib/targets.ts";

export type GenPromptsRequest = { model: string; count: number; harnesses: readonly HarnessId[] };

export type GenPromptsResult = {
  root: string;
  corpus: { model: string; generated: string; positive: string[]; negative: string[]; by: Record<string, Generated> };
  failed: readonly { target: Target; message: string }[];
  sameModel: readonly HarnessId[]; // harnesses that run the generator's own model: its prompts would flatter them
};

// Prompts for L6 from the description of every rule and skill the model picks by description, written once to
// a file for review rather than on every run (TASK §4.3).
export const createGenPromptsAction =
  (config: Config, cwd: string, env: Env) =>
  async (
    { model, count, harnesses }: GenPromptsRequest,
    progress: (done: number, total: number) => void = () => {},
  ) => {
    const { root } = await findRoot(cwd);
    const project = await openProject(root);
    const inventories = await Promise.all(
      harnesses.flatMap((harness) => STATIC_ADAPTERS[harness]?.discover(project) ?? []),
    );
    const targets = targetsOf(inventories);
    const deps = { upstream: config.upstream, egress: await egressOf(resolveNetwork(config, env)), env };
    const by: Record<string, Generated> = {};
    const failed: { target: Target; message: string }[] = [];
    for (const [index, target] of targets.entries()) {
      progress(index, targets.length);
      try {
        const generated = parseGenerated(await askModel(deps, model, questionFor(target, count)));
        if (generated) by[target.path] = generated;
        else failed.push({ target, message: "no JSON with prompts in the answer" });
      } catch (error) {
        failed.push({ target, message: (error as Error).message });
      }
    }
    progress(targets.length, targets.length);
    const sameModel = harnesses.filter((harness) => {
      const tested = config.harnesses[harness]?.model ?? CAPTURE_ADAPTERS[harness]?.defaultModel;
      return tested !== undefined && tested.split("/").at(-1) === model.split("/").at(-1);
    });
    const result: GenPromptsResult = {
      root: relative(cwd, root) || ".",
      corpus: {
        model,
        generated: new Date().toISOString().slice(0, 10),
        positive: Object.values(by).flatMap((one) => one.positive),
        negative: Object.values(by).flatMap((one) => one.negative),
        by,
      },
      failed,
      sameModel,
    };
    return { ...result, targets };
  };
createGenPromptsAction.inject = ["config", "cwd", "env"] as const;
export type GenPromptsAction = ReturnType<typeof createGenPromptsAction>;
