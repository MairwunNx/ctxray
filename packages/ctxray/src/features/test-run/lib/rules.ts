import type { Inventory, Project } from "#entities/harness/index.ts";
import type { Activation } from "#shared/contract/index.ts";
import { isGlob, matchesGitignore } from "#shared/glob/index.ts";
import { fail } from "./failure.ts";
import { type CellScope, currentCell } from "./scope.ts";

export type RuleSelector = {
  owner?: string | readonly string[]; // CODEOWNERS owners, like "@acme/payments"
  under?: string; // a folder or a glob, relative to the project root
  activation?: Activation | readonly Activation[];
};

// A rule or a skill as the harness has it, with the files that would load it.
export type Rule = {
  path: string;
  dir: string; // the directory it applies to
  activation: Activation;
  globs: readonly string[];
  matchingFiles: (options?: { sample?: number }) => string[];
  nonMatchingFile: () => string | undefined;
};

const SELECTORS = Symbol("ctxray.ruleSet");

// A lazy selection: which rules match depends on the harness, so it resolves inside a test.
export type RuleSet = {
  readonly [SELECTORS]: readonly RuleSelector[];
  where: (selector: RuleSelector) => RuleSet;
  readonly rules: Rule[];
  readonly root: string; // where the selected rules live: the `under` folder or their common directory
};

export const isRuleSet = (value: unknown): value is RuleSet =>
  typeof value === "object" && value !== null && SELECTORS in value;

const listOf = <T>(value: T | readonly T[] | undefined): readonly T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value as T];

const isWithin = (path: string, dir: string) => dir === "" || path === dir || path.startsWith(`${dir}/`);

// Evenly spread over the list, so a sample of 3 out of 300 files isn't three neighbours.
const spread = (files: readonly string[], sample: number | undefined) =>
  sample === undefined || sample >= files.length
    ? [...files]
    : Array.from({ length: sample }, (_, index) => files[Math.floor((index * files.length) / sample)] ?? "");

const toRule = (
  files: readonly string[],
  path: string,
  dir: string,
  activation: Activation,
  globs: readonly string[],
) => {
  const relative = (file: string) => (dir === "" ? file : file.slice(dir.length + 1));
  const matches = (file: string) =>
    file !== path &&
    isWithin(file, dir) &&
    (globs.length === 0 || globs.some((g) => matchesGitignore(g, relative(file))));
  return {
    path,
    dir,
    activation,
    globs,
    matchingFiles: ({ sample }: { sample?: number } = {}) => spread(files.filter(matches), sample),
    nonMatchingFile: () => files.find((file) => file !== path && !matches(file)),
  };
};

// Sorted, so a sample stays the same whether git lists a file as tracked or new.
export const rulesOf = (project: Project, inventory: Inventory): Rule[] => {
  const files = project.files.toSorted();
  return [
    ...inventory.instructions.map(({ path, dir, globs }) =>
      toRule(files, path, dir, globs ? "path" : "always", globs ?? []),
    ),
    ...inventory.skills.map(({ path, dir, listed, globs }) =>
      toRule(files, path, dir, listed ? "intent" : "manual", globs ?? []),
    ),
  ];
};

const describe = (selectors: readonly RuleSelector[]) =>
  selectors
    .map((selector, index) => `${index === 0 ? "discover.rules" : ".where"}(${JSON.stringify(selector)})`)
    .join("");

const matcher = (scope: CellScope, selector: RuleSelector) => {
  const owners = listOf(selector.owner)?.map((owner) => owner.toLowerCase());
  const activations = listOf(selector.activation);
  const { under } = selector;
  const { codeowners } = scope.workspace;
  if (owners && !codeowners) fail("discover.noCodeowners", { selector: describe([selector]) });
  return (rule: Rule) =>
    (!owners || owners.some((owner) => codeowners?.ownersOf(rule.path).includes(owner))) &&
    (!activations || activations.includes(rule.activation)) &&
    (under === undefined || (isGlob(under) ? new Bun.Glob(under).match(rule.path) : isWithin(rule.path, trim(under))));
};

const trim = (dir: string) => dir.replace(/^\.\//, "").replace(/\/+$/, "").replace(/^\.$/, "");

// An empty set fails: a typo in a selector would otherwise pass as a test that checks nothing.
export const selectRules = (scope: CellScope, set: RuleSet): Rule[] => {
  const selectors = set[SELECTORS];
  const all = rulesOf(scope.workspace.project, scope.inventory);
  const rules = selectors.reduce((left, selector) => left.filter(matcher(scope, selector)), all);
  if (rules.length === 0) fail("discover.empty", { selector: describe(selectors), harness: scope.harness });
  return rules;
};

const staticPrefix = (pattern: string) => {
  const parts = trim(pattern).split("/");
  const first = parts.findIndex(isGlob);
  return (first === -1 ? parts : parts.slice(0, first)).join("/");
};

const commonDir = (dirs: readonly string[]) =>
  dirs.reduce((common, dir) => {
    const a = common.split("/");
    const b = dir.split("/");
    const length = a.findIndex((part, index) => part !== b[index]);
    return (length === -1 ? a : a.slice(0, length)).join("/");
  });

const ruleSet = (selectors: readonly RuleSelector[]): RuleSet => ({
  [SELECTORS]: selectors,
  where: (selector) => ruleSet([...selectors, selector]),
  get rules() {
    return selectRules(currentCell(), this);
  },
  get root() {
    const under = selectors.findLast((selector) => selector.under !== undefined)?.under;
    return under === undefined ? commonDir(this.rules.map((rule) => rule.dir)) : staticPrefix(under);
  },
});

export const discover = { rules: (selector: RuleSelector = {}): RuleSet => ruleSet([selector]) };
