// Fails when a code file in the repository is longer than the project's limit.
import { $ } from "bun";
import { findOversized, isChecked, LIMIT, type SourceFile } from "./lib/file-size.ts";

const listed = await $`git ls-files --cached --others --exclude-standard -z`.text();
const paths = listed.split("\0").filter((path) => path !== "" && isChecked(path));

const files: SourceFile[] = [];
for (const path of paths) {
  const file = Bun.file(path);
  if (await file.exists()) files.push({ path, text: await file.text() });
}

const oversized = findOversized(files);
for (const { path, lines } of oversized) console.error(`${path}: ${lines} lines, the limit is ${LIMIT}`);
if (oversized.length > 0) process.exit(1);
console.log(`${files.length} files within ${LIMIT} lines`);
