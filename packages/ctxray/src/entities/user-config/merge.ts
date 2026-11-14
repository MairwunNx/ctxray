import type { Policy, UserConfig } from "#shared/contract/index.ts";

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof RegExp);

// Objects merge key by key. Anything else the override sets replaces the base, arrays included.
export const deepMerge = (base: unknown, override: unknown): unknown => {
  if (override === undefined) return base;
  if (!isPlain(base) || !isPlain(override)) return override;
  const result: Plain = { ...base };
  for (const [key, value] of Object.entries(override)) result[key] = deepMerge(base[key], value);
  return result;
};

// A policy with an inherited id merges into it, a new one goes to the end.
const mergePolicies = (base: readonly Policy[], override: readonly Policy[]): Policy[] => {
  const merged = [...base];
  for (const policy of override) {
    const index = merged.findIndex((existing) => existing.id === policy.id);
    if (index === -1) merged.push(policy);
    else merged[index] = deepMerge(merged[index], policy) as Policy;
  }
  return merged;
};

const sameRegExp = (a: RegExp, b: RegExp) => a.source === b.source && a.flags === b.flags;

// Redaction only grows: a config can add patterns but never drop the ones it inherits.
const mergePatterns = (base: readonly RegExp[], override: readonly RegExp[]): RegExp[] => [
  ...base,
  ...override.filter((pattern) => !base.some((existing) => sameRegExp(existing, pattern))),
];

// `override` is the config that extends `base`. `extends` itself is spent by the time configs merge.
export const mergeConfigs = (base: UserConfig, override: UserConfig): UserConfig => {
  const { extends: _, policies, redact, ...rest } = override;
  const merged = deepMerge(base, rest) as UserConfig;
  if (policies) merged.policies = mergePolicies(base.policies ?? [], policies);
  if (redact?.patterns) merged.redact = { patterns: mergePatterns(base.redact?.patterns ?? [], redact.patterns) };
  return merged;
};
