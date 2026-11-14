import { z } from "zod";
import type { MessageKey, Params } from "../../shared/i18n/index.ts";

export type ConfigProblem = { readonly key: MessageKey; readonly params: Params };

// Thrown inside the loader and caught at its edge, which turns it into a result.
export class ConfigFailure extends Error {
  constructor(readonly problems: readonly ConfigProblem[]) {
    super(problems.map((problem) => problem.key).join(", "));
  }
}

export const fail = (key: MessageKey, params: Params): never => {
  throw new ConfigFailure([{ key, params }]);
};

const ZOD_LOCALES: Readonly<Record<string, () => { localeError: z.core.$ZodErrorMap }>> = {
  en: z.locales.en,
  ru: z.locales.ru,
};

// Zod words its own messages, so they follow the CLI language like everything else.
export const zodErrors = (lang: string) => (ZOD_LOCALES[lang] ?? z.locales.en)().localeError;

// `policies[0].maxTokens`
const formatPath = (path: readonly PropertyKey[]) =>
  path
    .map((segment, index) => (typeof segment === "number" ? `[${segment}]` : `${index ? "." : ""}${String(segment)}`))
    .join("");

export const issueProblem = (issue: z.core.$ZodIssue, file: string): ConfigProblem => {
  const where = issue.path.length > 0 ? `${file} → ${formatPath(issue.path)}` : file;
  const key = issue.code === "custom" ? issue.params?.["key"] : undefined;
  if (typeof key === "string") return { key: key as MessageKey, params: { where } };
  return { key: "config.invalid", params: { where, message: issue.message } };
};
