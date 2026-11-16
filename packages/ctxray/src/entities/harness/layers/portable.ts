import { findHrefs, findImports } from "#shared/markdown/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { configReadersOf } from "../locations.ts";
import type { Project } from "../project.ts";

// A path into someone's home folder or onto a Windows drive: it works on the author's machine, and the team and
// CI don't have it. System folders like /usr/bin stay out: they're the same everywhere.
const ON_ONE_MACHINE =
  /(?:^|[\s=,;:'"(])((?:~|\$HOME|\$\{HOME\}|%USERPROFILE%)(?=[\\/]|$)\S*|\/Users\/[^\s/"']+\S*|\/home\/[^\s/"']+\S*|[A-Za-z]:[\\/]\S*)/;

const machinePath = (value: string) => ON_ONE_MACHINE.exec(value.replace(/^file:\/\//, ""))?.[1];

const finding = (path: string, value: string, line: number) =>
  problem("lint.absolutePath", "warning", path, { value: value.replace(/["',)\]]+$/, "") }, line);

// Frontmatter lines (paths, globs), `@` imports, and link targets of one Markdown file.
const inMarkdown = (path: string, text: string): Problem[] => {
  const head = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const front = head.split("\n").flatMap((line, index) => {
    const value = machinePath(line);
    return value === undefined ? [] : [finding(path, value, index + 2)];
  });
  const references = [...findImports(text), ...findHrefs(text)].flatMap(({ target, line }) => {
    const value = machinePath(target);
    return value === undefined ? [] : [finding(path, value, line)];
  });
  return [...front, ...references];
};

// Every string of a config file: MCP servers' command, args, cwd, and env, OpenCode's instructions.
const inConfig = (path: string, text: string): Problem[] =>
  text.split("\n").flatMap((line, index) =>
    [...line.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].flatMap((match) => {
      const value = machinePath((match[1] ?? match[2] ?? "").replaceAll("\\\\", "\\"));
      return value === undefined ? [] : [finding(path, value, index + 1)];
    }),
  );

export const absolutePaths = async (project: Project, inventory: Inventory): Promise<Problem[]> => {
  const documents = [
    ...inventory.instructions.map((file) => file.path),
    ...inventory.skills.map((skill) => skill.path),
    ...inventory.commands.map((command) => command.path),
  ];
  const configs = project.files.filter((path) => configReadersOf(path).includes(inventory.harness));
  const [texts, configTexts] = await Promise.all([project.readAll(documents), project.readAll(configs)]);
  return [
    ...documents.flatMap((path, index) => inMarkdown(path, texts[index] ?? "")),
    ...configs.flatMap((path, index) => inConfig(path, configTexts[index] ?? "")),
  ];
};
