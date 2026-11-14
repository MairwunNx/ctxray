import { dirname, resolve } from "node:path";
import { fail } from "./failure.ts";
import {
  type Body,
  type ContextOf,
  KIND_LAYERS,
  type Kind,
  type SuiteOptions,
  type TestDefinition,
  type TestOptions,
} from "./model.ts";
import { isRuleSet, type Rule, type RuleSet } from "./rules.ts";

type Frame = { name: string; fixture: string | undefined };

export type Collector = {
  file: string;
  frames: Frame[];
  tests: TestDefinition[];
  pending: Promise<unknown>[]; // corpora still loading: each settles with its error, or undefined
};

// Test files import suite() and test() from a module, so their calls need a place to land. While the runner
// imports one file, this points at that file's collector, the way bun:test collects its tests.
let current: Collector | undefined;

export const collecting = (): Collector => current ?? fail("dsl.outsideRun");

export const withCollector = async (collector: Collector, load: () => Promise<unknown>): Promise<void> => {
  current = collector;
  try {
    await load();
  } finally {
    current = undefined;
  }
};

type Args<B> = [body: B] | [options: TestOptions, body: B];

export const suite = (name: string, ...args: [body: () => void] | [options: SuiteOptions, body: () => void]): void => {
  const collector = collecting();
  const [options, body] = args.length === 1 ? [{}, args[0]] : args;
  const parent = collector.frames.at(-1);
  const fixture = options.fixture === undefined ? parent?.fixture : resolve(dirname(collector.file), options.fixture);
  collector.frames.push({ name, fixture });
  try {
    // Tests registered after an await would land in whatever suite runs next.
    if ((body() as unknown) instanceof Promise) fail("dsl.asyncSuite", { name });
  } finally {
    collector.frames.pop();
  }
};

// `{rule.path}` in a name takes the item's value.
export const formatName = (template: string, item: Readonly<Record<string, unknown>>) =>
  template.replace(/\{([\w.]+)\}/g, (placeholder, path: string) => {
    const value = path
      .split(".")
      .reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], item);
    if (value === undefined) return placeholder;
    return typeof value === "string" ? value : JSON.stringify(value);
  });

type Extra = Pick<TestDefinition, "item" | "rules">;

const register = (kind: Kind, name: string, args: Args<Body>, extra: Extra) => {
  const collector = collecting();
  const [options, body] = args.length === 1 ? [{}, args[0]] : args;
  const suites = collector.frames.map((frame) => frame.name);
  const base = [...suites, name].join(" › ");
  const taken = new Set(collector.tests.map((test) => test.key));
  let key = base;
  for (let copy = 2; taken.has(key); copy++) key = `${base} (${copy})`;
  collector.tests.push({
    file: collector.file,
    suites,
    fixture: collector.frames.at(-1)?.fixture,
    name,
    key,
    kind,
    options,
    body,
    ...extra,
  });
};

type Define<C> = {
  (name: string, body: (context: C) => unknown): void;
  (name: string, options: TestOptions, body: (context: C) => unknown): void;
};
type Each<C> = {
  (rules: RuleSet): Define<C & { rule: Rule }>;
  <Item extends Readonly<Record<string, unknown>>>(items: readonly Item[]): Define<C & Item>;
};
export type TestKind<C> = Define<C> & { each: Each<C> };

const define = <K extends Kind>(kind: K): TestKind<ContextOf<K>> => {
  const single = (name: string, ...args: Args<Body>) => register(kind, name, args, {});
  const each =
    (source: RuleSet | readonly Readonly<Record<string, unknown>>[]) =>
    (template: string, ...args: Args<Body>) => {
      if (isRuleSet(source)) return register(kind, template, args, { rules: source });
      for (const item of source) {
        if (typeof item !== "object" || item === null) fail("dsl.eachItem", { name: template });
        register(kind, formatName(template, item), args, { item });
      }
    };
  return Object.assign(single, { each }) as TestKind<ContextOf<K>>;
};

// test.resolve checks L3, test.assemble L4, and so on up the Loadout Stack.
export const test = Object.fromEntries(Object.keys(KIND_LAYERS).map((kind) => [kind, define(kind as Kind)])) as {
  [K in Kind]: TestKind<ContextOf<K>>;
};
