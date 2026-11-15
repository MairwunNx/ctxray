import { AsyncLocalStorage } from "node:async_hooks";
import type { Inventory, Project } from "#entities/harness/index.ts";
import type { Codeowners } from "#shared/codeowners/index.ts";
import type { HarnessId, LoadoutSnapshot } from "#shared/contract/index.ts";
import type { Judgement, Threshold } from "#shared/stats/index.ts";
import { fail } from "./failure.ts";

// A project the tests look at: the repository, or a suite's fixture. Read-only, opened once per run.
export type Workspace = {
  root: string;
  project: Project;
  codeowners: Codeowners | undefined;
  inventoryOf: (harness: HarnessId) => Promise<Inventory>;
};

export type SnapshotCheck = (value: unknown, variant: string) => void;

// One harness session of a test, for the report: the context it started with, the largest one it reached,
// and what each turn added on the way.
export type SessionRecord = {
  start: LoadoutSnapshot;
  peak: LoadoutSnapshot;
  timeline: readonly { turn: number; added: readonly string[]; tokens: number }[];
};

// One rate an L6 or L7 check judged: what it counted, against what threshold, and the verdict.
export type Stat = Judgement & { subject: string; threshold: Threshold };

// What a test body runs against: one harness in one workspace.
export type CellScope = {
  harness: HarnessId;
  workspace: Workspace;
  inventory: Inventory;
  snapshot: SnapshotCheck;
  stats: Stat[]; // filled by the checks of L6 and L7
  sessions: SessionRecord[]; // filled as sessions end
  seen: Set<string>; // rules and skills a test looked at, by path, for the coverage of the report
};

// `expect.on()` and `discover` sets are module functions, so they find their harness here.
const cells = new AsyncLocalStorage<CellScope>();

export const inCell = <T>(scope: CellScope, run: () => T): T => cells.run(scope, run);

export const currentCell = (): CellScope => cells.getStore() ?? fail("dsl.outsideTest");
