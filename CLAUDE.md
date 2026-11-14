# ctxray: notes for AI agents

ctxray is an X-ray for agent harnesses. It shows what Claude Code, Codex, Cursor, Gemini CLI, OpenCode, and Claude Code Desktop loaded into a model's context (rules, skills, MCP servers and tools, commands, the system prompt, their tokens and why each piece got there), and it lets teams test that in CI. README.md is the shop window, README.RU.md its Russian copy. The manual is the GitHub wiki (https://github.com/MairwunNx/ctxray/wiki).

## Talking to the owner

- Reply in Russian and address the owner as «вы». Quotes «ёлочки», nested „лапки“, an em dash with spaces « — ».
- Code, comments, identifiers, and commit messages are in English. Every string a user sees goes through the i18n catalog (English is the source, Russian ships too). A hard-coded user-facing string is a bug.
- English prose uses curly quotes “ ” and an en dash with spaces ( – ), never an em dash. No semicolons between clauses.

## Hard rules

- **Stack:** Bun + TypeScript (strict) + Elysia, nothing else. Bun is pinned in `package.json` (`packageManager`).
- **Architecture:** Feature-Action Architecture, strictly. Read `Feature-Action-Architecture/AI.md` and `Feature-Action-Architecture/examples/ts-bun.md` (a git submodule, run `git submodule update --init` after cloning).
- **DI:** typed-inject in a functional style. Factories take dependencies as **positional** parameters and declare their tokens:

  ```ts
  export const createInspectAction = (ruleDal: RuleDal, config: Config) => async (cwd: string) => { … };
  createInspectAction.inject = ["ruleDal", "config"] as const;
  ```

  Don't copy the `(deps: Deps) => …` shape from the FAA README: typed-inject passes arguments by position, so it fails typecheck and crashes at runtime. No service classes with state where a function will do, no global singletons. State that lives for a run sits in a closure inside a per-run child injector.
- **Simplest code.** No abstractions “for later”. Explicit beats magic.
- **Small files:** aim for about 120 lines, never more than 200 (i18n catalogs and fixtures excepted). `scripts/check-file-size.ts` fails CI otherwise.
- **Biome** is the only linter and formatter. No ESLint, no Prettier.
- **Unit tests** (`bun:test`) for logic: resolvers, normalisation, harness config parsing, statistics, redaction, locale resolution, plurals, policies, report line rendering, matrix expansion. Skip the trivial. Use `test.each` tables wherever one behaviour meets many inputs, harnesses and locales above all.
- **No telemetry, no network by default.** ctxray talks only to the upstream and registry the user configured.
- **Secrets and PII** never reach traces, logs, reports, or snapshots in clear text. Redaction runs before anything is written to disk.
- **Never touch the user's working tree** during a test run: fixtures and canary markers live in an isolated temporary copy. Harness runs also never touch the user's real `HOME` (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.config/opencode`, `~/.cursor`, the macOS keychain).

## How it fits together

One Bun workspace. `packages/ctxray` is the CLI and the npm package `@mairwunnx/ctxray`. Its `src/` follows FAA:

| Layer | In ctxray |
|---|---|
| `app/` | CLI entry (`main.ts`), command router, DI container (`container.ts`), Elysia app assembly, `Bun.plugin` setup for user test files |
| `features/` | One user-facing use case per CLI command: `inspect`, `test-run`, `diff`, `spectate`, `show-report`, `harness-install`, … Each has `<verb>.action.ts`, a thin `api/command.ts` (parse flags, call the action, hand the result to a renderer) or `api/routes.ts`, and `index.ts` as its public boundary |
| `entities/` | Domain logic two or more features reuse: `harness` (adapter contract and one subfolder per harness), `loadout` (diff, snapshots), `lockfile`, `harness-cache`, `user-config`, `trace` |
| `shared/` | No ctxray domain: `i18n`, `redact`, `tokens`, `stats`, `render` (Ink and plain), `infra` (fs, process, http, env), and `contract` (the versioned Loadout, Result, and Trace schemas every layer reads) |

Imports go only downward: app → features → entities → shared. Never feature → feature, never entity → entity. Imports keep the `.ts` extension. Another slice or layer comes through its `index.ts` by alias: `#shared/i18n/index.ts`, `#entities/user-config/index.ts` (the `imports` map in `packages/ctxray/package.json`, `#ctxray/*` for root scripts). Inside a slice use `./` or one `../`, never `../../`. No global barrels.

Key concepts, all explained in the wiki: the **Loadout** (everything the agent went into a turn with), the **Loadout Stack** L1 Lint, L2 Policy, L3 Resolve, L4 Assemble, L5 Wire, L6 Activate, L7 Scenario, and the capture **modes** a harness adapter declares: `static` (reads files only), `capture` (ctxray launches the harness and records requests through its proxy), `observe` (the user works, ctxray records through hooks).

## Development

```sh
bun install
bun run check   # biome check, tsc, file size limit
bun test        # unit tests
bun run fix     # biome check --write
```

`PLAN.md`, `docs/adr/`, and `spikes/` are local development notes: they're in `.gitignore` and never get committed.

## Commits and releases

- Conventional Commits in English: `feat(proxy): …`, `fix(i18n): …`, `chore(ci): …`, `docs(wiki): …`. One logical change per commit, and each commit builds and passes its tests.
- `CHANGELOG.md` holds a section per version. The release workflow takes the notes from it.
- GitHub secrets come from the owner's `infrastructure/secrets.toml`. When a step needs a key that isn't there, name it to the owner before the step. Never print a secret's value.
- Before creating another repository, publishing to npm, ghcr, Homebrew, Scoop, or a marketplace, or setting secrets, ask the owner.
