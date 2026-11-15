import { createForward, createPlayer, createRecorder, credentialsFor, type Miss } from "#entities/proxy/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Egress, Env } from "#shared/infra/index.ts";
import type { RelaySpec } from "./capture.ts";
import type { Cassettes } from "./cassettes.ts";
import type { Spend } from "./spend.ts";

export type BackendDeps = {
  kind: "real" | "replay";
  record: boolean; // real only: keep the answers as cassettes
  upstream: string | undefined;
  env: Env;
  egress: () => Promise<Egress>;
  cassettes: Cassettes;
  spend: Spend;
  clean: (text: string) => string; // redaction, before a tape reaches the disk
};

// Where one sample's tape lives: the test file, the harness, and a key stable across runs.
export type TapeKey = { file: string; harness: HarnessId; key: string };

// What a sample ran against, once it ended: a tape that ran out, or nothing to say.
export type SampleBackend = {
  spec: RelaySpec;
  done: (ran: { version: string; model: string }) => Promise<void>;
  misses: () => readonly Miss[];
  recorded: () => Promise<{ version: string; model: string } | undefined>; // replay: the tape's own versions
};

const realOf = async (deps: BackendDeps, tape: TapeKey, maxTurns: number): Promise<SampleBackend> => {
  const egress = await deps.egress();
  let recorder: ReturnType<typeof createRecorder> | undefined;
  return {
    spec: {
      maxTurns,
      refuse: deps.spend.refuse,
      inner: (work) => {
        recorder = deps.record ? createRecorder(work, deps.clean) : undefined;
        return createForward({
          upstream: deps.upstream,
          egress,
          headers: (protocol, sent) => credentialsFor(protocol, deps.env, sent.get("anthropic-beta")),
          onExchange: (exchange) => recorder?.onExchange(exchange),
          onAnswer: (exchange, answer) => {
            deps.spend.add(exchange, answer);
            recorder?.onAnswer(exchange, answer);
          },
        });
      },
    },
    done: async (ran) => {
      if (recorder)
        await deps.cassettes.put(tape.file, tape.harness, tape.key, { ...ran, entries: await recorder.tape() });
    },
    misses: () => [],
    recorded: async () => undefined,
  };
};

const replayOf = async (deps: BackendDeps, tape: TapeKey, maxTurns: number): Promise<SampleBackend> => {
  const recorded = await deps.cassettes.get(tape.file, tape.harness, tape.key);
  const misses: Miss[] = [];
  return {
    spec: {
      maxTurns,
      inner: (work) =>
        createPlayer(
          recorded?.entries ?? [],
          () => work()[0] ?? "",
          (miss) => misses.push(miss),
        ),
    },
    done: async () => {},
    misses: () => misses,
    recorded: async () => recorded && { version: recorded.version, model: recorded.model },
  };
};

export const createBackend = (deps: BackendDeps) => ({
  kind: deps.kind,
  sample: (tape: TapeKey, maxTurns: number) =>
    deps.kind === "real" ? realOf(deps, tape, maxTurns) : replayOf(deps, tape, maxTurns),
  // A budget spent before a test starts skips it rather than fail it.
  spent: () => deps.kind === "real" && deps.spend.refuse() !== undefined,
});
export type Backend = ReturnType<typeof createBackend>;
