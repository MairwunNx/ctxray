import {
  createForward,
  createPlayer,
  createRecorder,
  credentialsFor,
  keyVariables,
  type Miss,
  type Protocol,
  refusalOf,
  type UpstreamAnswer,
} from "#entities/proxy/index.ts";
import type { HarnessId } from "#shared/contract/index.ts";
import type { Egress, Env } from "#shared/infra/index.ts";
import type { RelaySpec } from "./capture.ts";
import type { Cassettes } from "./cassettes.ts";
import { CheckFailure } from "./failure.ts";
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
  refused: () => CheckFailure | undefined; // the model's API answered the session with an error
};

// A 401 or 403 means the key: the failure names the variables ctxray reads it from.
const refusedLive = (
  answers: readonly UpstreamAnswer[],
  protocol: Protocol | undefined,
  clean: (text: string) => string,
) => {
  const refusal = refusalOf(answers);
  if (!refusal) return undefined;
  const params = { status: String(refusal.status), message: clean(refusal.message) };
  const keys = protocol && (refusal.status === 401 || refusal.status === 403);
  return new CheckFailure(
    "upstream.refused",
    params,
    keys ? [{ label: "upstream.keys", value: keyVariables(protocol).join(", ") }] : [],
  );
};

const realOf = async (deps: BackendDeps, tape: TapeKey, maxTurns: number): Promise<SampleBackend> => {
  const egress = await deps.egress();
  let recorder: ReturnType<typeof createRecorder> | undefined;
  // Only an error keeps its body: the refusal check reads nothing else, and turns can run to megabytes.
  const answers: UpstreamAnswer[] = [];
  let protocol: Protocol | undefined;
  const refused = () => refusedLive(answers, protocol, deps.clean);
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
            protocol = exchange.protocol;
            const text = answer.status >= 400 ? answer.text : "";
            answers.push({ position: exchange.position, status: answer.status, text });
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
    refused,
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
    refused: () => undefined,
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
