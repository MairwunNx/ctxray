import { textOf } from "#shared/markdown/index.ts";
import { expandImports } from "../imports.ts";
import { type Command, type Instruction, type Inventory, type Problem, problem, type Skill } from "../inventory.ts";
import { joinPath, type Project, readMatching } from "../project.ts";
import { readSkillFiles } from "../skill-file.ts";
import { type GeminiSettings, readGeminiSettings } from "./settings.ts";

export const DEFAULT_CONTEXT_FILE = "GEMINI.md";
const SKILL = /^(?:(.*)\/)?\.(?:gemini|agents)\/skills\/([^/]+)\/SKILL\.md$/;
const COMMAND = /^(?:(.*)\/)?\.gemini\/commands\/(.+)\.toml$/;

// Every context file of every folder: GEMINI.md, plus the names any settings add with `context.fileName`.
const findInstructions = async (project: Project, settings: readonly GeminiSettings[], problems: Problem[]) => {
  const names = [...new Set([DEFAULT_CONTEXT_FILE, ...settings.flatMap((one) => one.contextFiles)])];
  const pairs = project.dirs.flatMap((dir) => names.map((name) => ({ dir, name, path: joinPath(dir, name) })));
  const texts = await project.readAll(pairs.map(({ path }) => path));
  const roots = pairs.flatMap(({ dir, name, path }, index): Instruction[] => {
    const text = texts[index];
    if (text === undefined) return [];
    // Gemini CLI skips an empty file without a word.
    if (text.trim() === "") {
      problems.push(problem("lint.empty", "warning", path, { harness: "Gemini CLI" }));
      return [];
    }
    return [{ path, dir, kind: name === "AGENTS.md" ? "agents" : "memory", imports: [], text }];
  });
  // `@path` imports inline the file they name, five levels deep.
  return expandImports(project, roots, problems, 5);
};

// A skill without a name or a description key never loads: Gemini CLI drops it silently. A bare
// `description:` still lists it, with nothing to pick it by (spike 0017).
const findSkills = async (project: Project, problems: Problem[]): Promise<Skill[]> =>
  (await readSkillFiles(project, SKILL, problems)).map(({ path, dir, folder, frontmatter: { data, body } }) => {
    const name = textOf(data["name"])?.replace(/[:\\/<>*?"|]/g, "-");
    const description = textOf(data["description"]);
    const given = "description" in data;
    if (name === undefined)
      problems.push(problem("lint.skillField", "error", path, { harness: "Gemini CLI", field: "name" }));
    if (!given)
      problems.push(problem("lint.skillField", "error", path, { harness: "Gemini CLI", field: "description" }));
    else if (description === undefined)
      problems.push(problem("lint.noDescription", "warning", path, { name: name ?? folder }));
    const listed = name !== undefined && given;
    return { name: name ?? folder, path, dir, description: description ?? "", listed, body };
  });

// `.gemini/commands/git/commit.toml` is `/git:commit`. The CLI expands it before the model sees anything.
const findCommands = async (project: Project, problems: Problem[]): Promise<Command[]> =>
  (await readMatching(project, COMMAND)).flatMap(({ path, match, text }) => {
    try {
      const raw = Bun.TOML.parse(text) as Record<string, unknown>;
      const prompt = textOf(raw["prompt"]) ?? "";
      const name = (match[2] ?? "").replaceAll("/", ":");
      return [{ name, path, dir: match[1] ?? "", description: textOf(raw["description"]) ?? "", body: prompt }];
    } catch (error) {
      problems.push(
        problem("lint.badToml", "error", path, {
          harness: "Gemini CLI",
          message: error instanceof Error ? error.message : "",
        }),
      );
      return [];
    }
  });

export const discoverGeminiCli = async (project: Project): Promise<Inventory> => {
  const problems: Problem[] = [];
  const settings = await readGeminiSettings(project, problems);
  const skillProblems: Problem[] = [];
  const commandProblems: Problem[] = [];
  const [instructions, skills, commands] = await Promise.all([
    findInstructions(project, settings, problems),
    findSkills(project, skillProblems),
    findCommands(project, commandProblems),
  ]);
  return {
    harness: "gemini-cli",
    instructions,
    skills,
    commands,
    mcp: settings.flatMap((one) => one.mcp),
    problems: [...problems, ...skillProblems, ...commandProblems],
    contextFiles: Object.fromEntries(settings.map((one) => [one.dir, one.contextFiles])),
  };
};
