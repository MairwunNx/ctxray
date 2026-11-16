// Writes a release's notes to the file in the first argument: the text typed into the workflow's `changelog`
// field (RELEASE_NOTES) or the version's section of CHANGELOG.md, and how to install it.
const out = process.argv[2];
if (!out) throw new Error("usage: bun scripts/release/notes.ts <file>");
const { version } = await Bun.file("packages/ctxray/package.json").json();
const typed = (process.env["RELEASE_NOTES"] ?? "").trim();

const log = await Bun.file("CHANGELOG.md").text();
const heading = new RegExp(`^## ${version.replaceAll(".", "\\.")}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");

const notes = typed || heading.exec(log)?.[1]?.trim() || "";
if (notes === "" || notes === "Not released yet.") {
  console.error(
    `::error::No notes for ${version}: fill its “## ${version}” section in CHANGELOG.md or the changelog field`,
  );
  process.exit(1);
}

const install = `\`\`\`sh
npm install --save-dev @mairwunnx/ctxray@${version}
curl -fsSL https://github.com/MairwunNx/ctxray/releases/download/v${version}/install.sh | CTXRAY_VERSION=${version} sh
brew install mairwunnx/tap/ctxray
docker pull ghcr.io/mairwunnx/ctxray:${version}
\`\`\``;
await Bun.write(out, `${notes}\n\n${install}\n`);
console.log(await Bun.file(out).text());

export {};
