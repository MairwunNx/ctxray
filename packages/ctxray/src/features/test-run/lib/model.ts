import type { Capability } from "#entities/harness/index.ts";
import type { HarnessId, Layer } from "#shared/contract/index.ts";
import type { CapturedLoadout } from "./captured.ts";
import type { ResolvedLoadout, ResolveRequest } from "./loadout.ts";
import type { RuleSet } from "./rules.ts";
import type { Session, SessionRequest } from "./session.ts";

// Each test kind checks one layer of the Loadout Stack. L1 and L2 need no tests: ctxray runs them itself.
export const KIND_LAYERS = {
  resolve: "L3",
  assemble: "L4",
  wire: "L5",
  activate: "L6",
  scenario: "L7",
} as const satisfies Record<string, Layer>;
export type Kind = keyof typeof KIND_LAYERS;

export type TestOptions = {
  requires?: readonly Capability[]; // a harness without one of these skips the test as unsupported
  retries?: number; // runs again after a failure, and a later pass marks the test flaky
  timeout?: number; // milliseconds, 30 s by default, 120 s for tests that launch a harness
  cwd?: string; // L5: where the session's harness starts, relative to the project root
  // L6: what the agent gets asked, and how many times.
  prompt?: string;
  positive?: readonly string[];
  negative?: readonly string[];
  samples?: number;
};

export type SuiteOptions = { fixture?: string }; // a project folder, relative to the test file

export type BaseContext = { harness: HarnessId };
export type ResolveContext = BaseContext & { resolve: (request?: ResolveRequest) => Promise<ResolvedLoadout> };
// L4: launch the harness, take its first request. L5: drive a session turn by turn.
export type AssembleContext = BaseContext & { assemble: (request?: SessionRequest) => Promise<CapturedLoadout> };
export type WireContext = BaseContext & { session: Session; startSession: (request?: SessionRequest) => Session };
export type ContextOf<K extends Kind> = K extends "resolve"
  ? ResolveContext
  : K extends "assemble"
    ? AssembleContext
    : K extends "wire"
      ? WireContext
      : BaseContext;

// biome-ignore lint/suspicious/noExplicitAny: a body's context differs per kind, the registry holds them all
export type Body = (context: any) => unknown;

// One registered test. `rules` is set by `.each(discover.rules(…))`: its rules depend on the harness, so the
// test turns into one per rule only when the matrix knows the harness.
export type TestDefinition = {
  file: string; // absolute
  suites: readonly string[];
  fixture: string | undefined; // absolute
  name: string;
  key: string; // stable within the suite: snapshots and history hang on it
  kind: Kind;
  options: TestOptions;
  item?: Readonly<Record<string, unknown>>;
  rules?: RuleSet;
  body: Body;
};
