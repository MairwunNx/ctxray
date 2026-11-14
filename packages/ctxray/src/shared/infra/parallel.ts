import pMap from "p-map";

// Enough to keep the disk busy, few enough to stay far from the open-file limit on a large monorepo.
const CONCURRENCY = 64;

// Runs `task` on every item at once, up to the limit, and returns the results in the items' order.
export const inParallel = <Item, Result>(
  items: Iterable<Item>,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> => pMap(items, task, { concurrency: CONCURRENCY });

// Like Promise.all, but waits for every promise and throws the first failure in the given order, not in time,
// so the same broken input always reports the same error.
export const allInOrder = async <Result>(promises: readonly Promise<Result>[]): Promise<Result[]> => {
  const settled = await Promise.allSettled(promises);
  const failed = settled.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
  return settled.map((outcome) => (outcome as PromiseFulfilledResult<Result>).value);
};
