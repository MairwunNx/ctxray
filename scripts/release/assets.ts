// The files a GitHub release carries: one archive per platform, which is also its offline bundle (the binary,
// the JSON Schemas, the GitLab template, and the Claude Code plugin), the same extras on their own, and SHA256SUMS.
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { $ } from "bun";
import { archive, exe, type Target } from "./targets.ts";

// Extras every archive carries next to the binary, and the release carries on their own.
export const EXTRAS = ["ctxray.gitlab-ci.yml", "harnesses.Dockerfile", "ctxray-claude-plugin.zip"] as const;

export const packArchive = async (target: Target, binary: string, assets: string, schemas: string) => {
  const stage = await mkdtemp(join(tmpdir(), "ctxray-archive-"));
  try {
    await cp(binary, join(stage, exe(target)));
    await cp("LICENSE", join(stage, "LICENSE"));
    await cp(schemas, join(stage, "schemas"), { recursive: true });
    for (const extra of EXTRAS) await cp(join(assets, extra), join(stage, extra));
    const out = resolve(assets, archive(target));
    // Without -X and --no-xattrs, zip and macOS tar pack file attributes that Linux tar warns about.
    if (target.os === "win32") await $`zip -r -X -q ${out} .`.cwd(stage);
    else await $`tar --no-xattrs -czf ${out} *`.cwd(stage);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
};

const sha256 = async (path: string) =>
  new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex");

// `sha256sum` format: the hash, two spaces, the name. install.sh and install.ps1 read it this way.
export const writeChecksums = async (assets: string) => {
  const names = (await readdir(assets)).filter((name) => name !== "SHA256SUMS").sort();
  const sums = new Map<string, string>();
  for (const name of names) sums.set(name, await sha256(join(assets, name)));
  await Bun.write(join(assets, "SHA256SUMS"), [...sums].map(([name, sum]) => `${sum}  ${name}\n`).join(""));
  return sums;
};

// Copies a text file with the release's version in place of __VERSION__.
export const stamp = async (from: string, to: string, version: string) => {
  await mkdir(join(to, ".."), { recursive: true });
  await Bun.write(to, (await Bun.file(from).text()).replaceAll("__VERSION__", version));
  return basename(to);
};
