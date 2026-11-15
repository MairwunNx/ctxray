import { callsOf } from "#entities/proxy/index.ts";
import { toFailure } from "./attempt.ts";
import type { SampleBackend } from "./backend.ts";
import type { Capture } from "./capture.ts";
import { CheckFailure } from "./failure.ts";
import { recordSession, requestOf } from "./request.ts";
import type { Run } from "./runs.ts";
import type { CellScope } from "./scope.ts";

export type SampleRequest = { cwd: string; prompt: string; sample: number; timeout: number };

// Tool inputs that name a file the agent read or wrote: L3 predicts what those files bring in.
const FILE_FIELDS = ["path", "file_path", "absolute_path", "filePath", "target_file"];

const filesOf = (inputs: readonly unknown[], work: readonly string[]) =>
  inputs.flatMap((input) => {
    if (typeof input !== "object" || input === null) return [];
    return FILE_FIELDS.flatMap((field) => {
      const value = (input as Record<string, unknown>)[field];
      if (typeof value !== "string") return [];
      const inside = work.find((dir) => value.startsWith(`${dir}/`));
      return [inside ? value.slice(inside.length + 1) : value];
    });
  });

const timedOut = (ms: number) => new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms).unref());

// Runs the harness on one prompt against a model that answers by itself, and reads the session off its last
// request: that one carries every rule and skill the agent picked up on the way.
export const runSample = async (
  capture: Capture,
  scope: CellScope,
  backend: SampleBackend,
  { cwd, prompt, sample, timeout }: SampleRequest,
): Promise<Run> => {
  const empty = { kind: "run" as const, prompt, sample, skills: [], rules: [], tools: [], changed: [], added: [] };
  let opened: Awaited<ReturnType<Capture["open"]>>;
  try {
    opened = await capture.open(scope, { cwd, prompt, relay: backend.spec });
  } catch (error) {
    return { ...empty, turns: 0, cut: false, loadout: undefined, snapshot: undefined, error: toFailure(error) };
  }
  const { harness, relay } = opened;
  let run: Run;
  try {
    const ended = await Promise.race([harness.exited(), timedOut(timeout)]);
    const turns = relay?.turns() ?? [];
    const first = turns[0];
    const last = turns.at(-1);
    const work = [harness.dirs.work, harness.dirs.root];
    const tools = last ? callsOf(last.protocol, last.body) : [];
    const files = filesOf(
      tools.map((call) => call.input),
      work,
    );
    const peak = last && (await requestOf(scope, opened, last, { cwd, files, before: undefined }));
    const start =
      first && first !== last ? await requestOf(scope, opened, first, { cwd, files: [], before: undefined }) : peak;
    const startIds = new Set([
      ...(start?.snapshot.rules.map((rule) => rule.path) ?? []),
      ...(start?.snapshot.skills.loaded.map((skill) => skill.name) ?? []),
    ]);
    recordSession(
      scope,
      [start, peak].filter((one) => one !== undefined),
    );
    const misses = backend.misses();
    run = {
      ...empty,
      skills: peak?.snapshot.skills.loaded ?? [],
      rules: peak?.snapshot.rules.map((rule) => rule.path) ?? [],
      tools,
      changed: await harness.changes(),
      added: [
        ...(peak?.snapshot.rules.map((rule) => rule.path) ?? []),
        ...(peak?.snapshot.skills.loaded.map((skill) => skill.name) ?? []),
      ].filter((id) => !startIds.has(id)),
      turns: turns.length,
      cut: relay?.cut() ?? false,
      loadout: peak?.loadout,
      snapshot: peak?.snapshot,
      ...(ended === "timeout" && {
        error: toFailure(new CheckFailure("run.timeout", { ms: timeout })),
      }),
      ...(misses.length > 0 && {
        error: toFailure(
          (await backend.recorded()) === undefined
            ? new CheckFailure("cassette.none", { harness: scope.harness })
            : new CheckFailure("cassette.miss", {
                path: misses[0]?.path ?? "",
                turn: String(misses[0]?.position ?? "—"),
              }),
        ),
      }),
    };
  } catch (error) {
    run = { ...empty, turns: 0, cut: false, loadout: undefined, snapshot: undefined, error: toFailure(error) };
  }
  const result = await harness.end();
  await opened.close();
  await backend.done({ version: harness.version, model: opened.model });
  if (run.error === undefined && result.code !== 0 && result.code !== null) {
    run.error = toFailure(
      new CheckFailure("capture.exited", { harness: scope.harness, code: String(result.code) }, [
        { label: "capture.output", value: result.output.split("\n").slice(-12).join("\n") || "—" },
        { label: "capture.trace", value: opened.trace },
      ]),
    );
  }
  return run;
};
