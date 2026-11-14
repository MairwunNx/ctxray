import { checkSupport, PROFILES, STATIC_ADAPTERS } from "#entities/harness/index.ts";
import type { Backend, HarnessId, Layer, SkipReason } from "#shared/contract/index.ts";
import { KIND_LAYERS, type TestDefinition } from "./model.ts";

// What this run covers: test × harness × backend, cut down by layer and name.
export type Selection = {
  harnesses: readonly HarnessId[];
  backend: { kind: Backend; name: string | undefined }; // `name` when the config's `backends` named it
  layers: ReadonlySet<Layer>;
  filter: string | undefined;
};

export const LAYERS: readonly Layer[] = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];

// `L1-L5`, `L3`, `l1,l3`, `3-5`: a list of layers and ranges. Undefined when something doesn't parse.
export const parseLayers = (text: string): Set<Layer> | undefined => {
  const picked = new Set<Layer>();
  for (const part of text.split(",").map((item) => item.trim().toUpperCase().replaceAll("L", ""))) {
    const [from, to = from] = part.split("-").map(Number);
    if (from === undefined || to === undefined || !(from >= 1 && from <= to && to <= LAYERS.length)) return undefined;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return undefined;
    for (let layer = from; layer <= to; layer++) picked.add(LAYERS[layer - 1] as Layer);
  }
  return picked;
};

export type Decision = { run: true } | { run: false; reason: SkipReason; missing?: readonly string[] };

export const fullName = (definition: Pick<TestDefinition, "suites" | "name">) =>
  [...definition.suites, definition.name].join(" › ");

// Unsupported says the harness can't do what the test needs. Unavailable says this ctxray can't run it yet:
// it reads files for L3, the runs that L4–L7 need come later.
export const decide = (definition: TestDefinition, harness: HarnessId, selection: Selection): Decision => {
  const layer = KIND_LAYERS[definition.kind];
  const filter = selection.filter?.toLowerCase();
  if (!selection.layers.has(layer) || (filter && !fullName(definition).toLowerCase().includes(filter))) {
    return { run: false, reason: "filtered" };
  }
  const mode = layer === "L3" ? "static" : "capture";
  const support = checkSupport(PROFILES[harness], {
    requires: definition.options.requires ?? [],
    mode,
    experimental: false,
  });
  if (!support.supported) return { run: false, reason: "unsupported", missing: support.missing };
  if (layer !== "L3" || !STATIC_ADAPTERS[harness]) return { run: false, reason: "unavailable" };
  return { run: true };
};
