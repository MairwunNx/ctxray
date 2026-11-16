import { realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type {
  HarnessId,
  LimitsInput,
  LintConfig,
  LintLevel,
  LintRule,
  ResolvedLimits,
} from "#shared/contract/index.ts";
import { mergeLimits, resolveLimits } from "#shared/contract/index.ts";
import type { MessageKey } from "#shared/i18n/index.ts";
import type { Problem } from "../inventory.ts";
import type { Project } from "../project.ts";

// The check behind each finding. A check can word its findings several ways, like the three glob problems.
const RULES: Partial<Record<MessageKey, LintRule>> = {
  "lint.frontmatter": "frontmatter",
  "lint.looseFrontmatter": "loose-frontmatter",
  "lint.ruleField": "rule-field",
  "lint.tooLarge": "too-large",
  "lint.importMissing": "import-missing",
  "lint.importDepth": "import-depth",
  "lint.shadowedCommand": "shadowed-command",
  "lint.noDescription": "no-description",
  "lint.longDescription": "long-description",
  "lint.badJson": "bad-json",
  "lint.badToml": "bad-toml",
  "lint.mcpTransport": "mcp-transport",
  "lint.empty": "empty-file",
  "lint.shadowed": "shadowed-file",
  "lint.skillField": "skill-field",
  "lint.budget": "codex-budget",
  "lint.overBudget": "codex-budget",
  "lint.globEmpty": "bad-glob",
  "lint.globUnbalanced": "bad-glob",
  "lint.globOutside": "bad-glob",
  "lint.skillName": "skill-name",
  "lint.skillFolderName": "skill-folder-name",
  "lint.duplicateSkill": "duplicate-skill",
  "lint.duplicateText": "duplicate-text",
  "lint.brokenLink": "broken-link",
  "lint.misnamed": "misnamed-file",
  "lint.letterCase": "letter-case",
  "lint.absolutePath": "absolute-path",
  "lint.byteOrderMark": "byte-order-mark",
  "lint.frontmatterTab": "frontmatter",
  "resolve.deadRule": "dead-rule",
  "resolve.deadPattern": "dead-rule",
  "size.lines": "size",
  "size.chars": "size",
  "size.tokens": "size",
  "reach.nowhere": "unread",
  "reach.nowhereSkills": "unread",
  "reach.otherHarness": "other-harness",
  "reach.otherHarnessSkills": "other-harness",
  "reach.otherHarnesses": "other-harness",
  "reach.otherHarnessesSkills": "other-harness",
  "reach.differs": "harness-differences",
  "reach.differsSkills": "harness-differences",
  "reach.differsMany": "harness-differences",
  "reach.differsManySkills": "harness-differences",
};

export const ruleOf = (key: MessageKey): LintRule | undefined => RULES[key];

// A file a symlink shows under two paths matches a glob by either: `.agents/skills/**` covers the skill that
// Claude Code reads as `.claude/skills/x/SKILL.md` through a link.
export type PathsOf = (path: string) => readonly string[];

const matcher = (pathsOf: PathsOf) => (globs: readonly string[], path: string) =>
  pathsOf(path).some((one) => globs.some((glob) => new Bun.Glob(glob).match(one)));

// Every path of a file in the project: its own, and the one its real file has.
export const projectPaths =
  (root: string): PathsOf =>
  (path) => {
    try {
      const real = relative(root, realpathSync(join(root, path)))
        .split(sep)
        .join("/");
      return real === path || real.startsWith("..") ? [path] : [path, real];
    } catch {
      return [path];
    }
  };

const overridesFor = (lint: LintConfig, path: string, harness: HarnessId, pathsOf: PathsOf) =>
  (lint.overrides ?? []).filter(
    (override) =>
      (!override.harnesses || override.harnesses.includes(harness)) && matcher(pathsOf)(override.include, path),
  );

// The size limits of one file: the project's, with every override that covers it on top, the last one winning.
export const limitsFor = (
  lint: LintConfig,
  base: LimitsInput | undefined,
  harness: HarnessId,
  pathsOf: PathsOf = (path) => [path],
) => {
  const cache = new Map<string, ResolvedLimits>();
  return (path: string): ResolvedLimits => {
    const applied = overridesFor(lint, path, harness, pathsOf).filter((override) => override.limits);
    const key = applied.map((override) => (lint.overrides ?? []).indexOf(override)).join(",");
    const known = cache.get(key);
    if (known) return known;
    const resolved = resolveLimits(applied.reduce((limits, override) => mergeLimits(limits, override.limits), base));
    cache.set(key, resolved);
    return resolved;
  };
};

// `<!-- ctxray-ignore -->` silences every check on the file, `<!-- ctxray-ignore broken-link, size: why -->` some.
const SUPPRESSION = /<!--\s*ctxray-ignore(?:\s+([\w\s,-]+?))?\s*(?::[^>]*)?-->/g;

const suppressedIn = (text: string): Set<string> | "all" | undefined => {
  const named = new Set<string>();
  for (const match of text.matchAll(SUPPRESSION)) {
    if (match[1] === undefined) return "all";
    for (const rule of match[1].split(/[\s,]+/)) if (rule !== "") named.add(rule);
  }
  return named.size > 0 ? named : undefined;
};

const levelOf = (setting: LintLevel | { level: LintLevel } | undefined) =>
  typeof setting === "object" ? setting.level : setting;

// The config over the findings: ignored files and suppressed checks drop out, every level set in `rules` and
// in the overrides that cover the file applies, the last one winning, and errorOnWarnings makes warnings fail.
export const applyLintConfig = async (
  problems: readonly Problem[],
  project: Project,
  lint: LintConfig,
  harness: HarnessId,
  pathsOf: PathsOf = projectPaths(project.root),
): Promise<Problem[]> => {
  const matches = matcher(pathsOf);
  const texts = new Map<string, ReturnType<typeof suppressedIn>>();
  const suppressed = async (path: string) => {
    if (!texts.has(path)) texts.set(path, suppressedIn((await project.read(path).catch(() => undefined)) ?? ""));
    return texts.get(path);
  };
  const kept: Problem[] = [];
  for (const found of problems) {
    const rule = ruleOf(found.key);
    if (lint.ignore && matches(lint.ignore, found.path)) continue;
    if (rule === undefined) {
      kept.push(found);
      continue;
    }
    const silenced = await suppressed(found.path);
    if (silenced === "all" || silenced?.has(rule)) continue;
    const levels = [
      lint.rules?.[rule],
      ...overridesFor(lint, found.path, harness, pathsOf).map((one) => one.rules?.[rule]),
    ];
    const level =
      levels
        .map(levelOf)
        .filter((one) => one !== undefined)
        .at(-1) ?? found.severity;
    if (level === "off") continue;
    kept.push({ ...found, severity: lint.errorOnWarnings ? "error" : level });
  }
  return kept;
};
