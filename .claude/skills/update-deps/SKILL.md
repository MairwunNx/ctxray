---
name: update-deps
description: Updates every dependency of ctxray to its newest stable version – Bun, TypeScript, Biome, npm packages, GitHub Actions, the Feature-Action Architecture submodule, and the harness versions pinned in lockfiles and fixtures. Use when the owner asks to update dependencies, libraries, or tools.
argument-hint: "[only these, e.g. bun biome]"
---

# Update dependencies

Bring every pinned version in ctxray up to the newest stable one, prove the project still works, and commit.

If the owner named only some dependencies (`$ARGUMENTS`), update just those.

## What moves together

- **Bun:** `packageManager` in the root `package.json`, `engines.bun` in `packages/ctxray/package.json`, and `@types/bun` (same version as Bun). CI reads Bun from `packageManager`. Install the new Bun locally first (`bun upgrade`), then `bun install` so `bun.lock` follows.
- **Biome:** the `@biomejs/biome` devDependency and the `$schema` URL in `biome.json`. Run `bunx biome migrate --write` after the bump, then `bunx biome check --write .`, and commit the reformat apart from the bump.
- **TypeScript:** the `typescript` devDependency. A new major can tighten checks: fix the code, never loosen `tsconfig.json`.
- **Libraries:** everything `bun outdated` lists, in every workspace package.
- **GitHub Actions:** the `uses:` lines in `.github/workflows/`. Keep pinning the major tag (`actions/checkout@v7`).
- **gitleaks rules:** `VERSION` in `scripts/gen-gitleaks.ts`. Run `bun run gitleaks`, which rewrites `packages/ctxray/src/shared/redact/gitleaks-rules.json`, then `bun test packages/ctxray/src/shared/redact`. A rule that fails to translate stops the script: fix `scripts/lib/go-regex.ts` and add the new syntax to its tests.
- **Feature-Action Architecture:** `git submodule update --remote Feature-Action-Architecture`, then commit the new submodule pointer.
- **Gemma vocabulary:** `packages/ctxray/src/shared/tokens/gemma/` holds Gemma 4's `tokenizer.json` (gzipped) and `tokenizer_config.json` from `google/gemma-4-E2B-it` at the revision `gemma.ts` names. Update it only when Google publishes a newer Gemma tokenizer: download both files at the new revision, gzip the vocabulary, update the revision in the comment, and check that the Gemini CLI counts in `bun test` still hold.
- **Harnesses of the capture fixture:** `packages/ctxray/fixtures/capture/ctxray.lock` pins Claude Code, Codex, Gemini CLI, OpenCode, and Cursor CLI (Cursor's local build comes from downloads.cursor.com, its version from cursor.com/install). Run `ctxray harness upgrade <name>@<version>` for each in a scratch copy of that folder (with `git init` and a commit), with `CTXRAY_CACHE_DIR` in a scratch folder so nothing lands in the owner's own cache. It prints the loadout diff between the old and the new builds: keep it for the report. Copy the new ctxray.lock back. Then, with the same `CTXRAY_CACHE_DIR`, run `bun scripts/record-payloads.ts <name>` (it takes the builds from the cache by the fixture's lockfile) and `ctxray test -u` in a scratch copy of the fixture, and copy the snapshots back. `bun test` shows what moved in the segmenters' contract tests: fix the segmenter when a marker changed. CI caches the builds by the hash of that lockfile.
- **Harnesses** in general: a new harness version changes what it loads, so loadout snapshots move with it. Upgrade one harness per commit with `ctxray harness upgrade <name>`, read the loadout diff it prints, update the snapshots, and say in the report what changed in the loadout.

## Steps

1. **Read CLAUDE.md**, then run `git status`: leave other people's uncommitted changes alone and keep them out of your commits.
2. **List every pinned version** from the places above, and look for more: `Dockerfile` `FROM` lines, `image:` lines, anything with a version in `.github/`.
3. **Find each newest version** where `sources.md` (next to this file) says to ask. Note old and new side by side. If nothing is behind, say so and stop: no commit, no changelog.
4. **Update in groups,** in this order: Bun, TypeScript, Biome, libraries, gitleaks rules, Actions, the submodule, then each harness. After each group run the check below, so a failure points at its cause.
5. **Majors:** read the release notes or the migration guide and fix the code. If a major breaks too much to fix well, keep the old major and say so in the report.
6. **Check:** `bun install && bun run check && bun test`. When Bun moved, also build the compiled binary and run its smoke test, once they exist: user test files reach the binary through `Bun.plugin` with `build.module`, which Bun doesn't document and may change.
7. **Changelog:** when an update reaches what ctxray ships (the CLI, the npm package, the image, the plugin), add a line to the topmost `CHANGELOG.md` section that isn't released yet (`gh release view vX.Y.Z` fails), or open a new section with the next patch version. Updates that only touch CI or development tools need none.
8. **Commit and push,** one commit per group, in Conventional Commits: `chore(deps): update Bun to 1.4.5`, `chore(deps): update Biome to 2.7.0`, `chore(ci): update actions/checkout to v8`.

## Running unattended

The weekly autopilot (`.github/workflows/autopilot.yml`) runs this with nobody to answer. Where a step would ask the owner, take the choice that keeps the project working as it does today and name it in the report. A failure you can't fix stays out of the commit: keep the old version and go on with the rest.

## Report

A short table: each dependency, old version, new version. Then what stayed behind and why, and how the check went.
