import { findSecrets, type Redactor } from "#shared/redact/index.ts";
import { type Inventory, type Problem, problem } from "../inventory.ts";
import { configReadersOf } from "../locations.ts";
import type { Project } from "../project.ts";

// Personal data warns, everything else is a secret and an error: the model reads it, and so does anyone
// with the repository. The finding names the kind and the line, never the value.
const PERSONAL = new Set(["email", "phone", "card"]);

export const secretsIn = async (project: Project, inventory: Inventory, redactor: Redactor): Promise<Problem[]> => {
  const paths = [
    ...inventory.instructions.map((file) => file.path),
    ...inventory.skills.map((skill) => skill.path),
    ...inventory.commands.map((command) => command.path),
    ...project.files.filter((path) => configReadersOf(path).includes(inventory.harness)),
  ];
  const unique = [...new Set(paths)];
  const texts = await project.readAll(unique);
  return unique.flatMap((path, index) =>
    findSecrets(redactor, texts[index] ?? "").map(({ kind, line }) =>
      PERSONAL.has(kind)
        ? problem("lint.personalData", "warning", path, { kind }, line)
        : problem("lint.secret", "error", path, { kind }, line),
    ),
  );
};
