# Where fresh versions come from

Ask the source, never your memory: versions move every week. Take the newest **stable** version. Skip anything marked alpha, beta, rc, canary, next, dev, insiders, or preview, unless the project already uses that channel.

Compare versions as numbers, part by part: 1.10 is newer than 1.9. A list sorted as text can name an older version.

| What | Where to ask | Notes |
|---|---|---|
| Bun | `gh api repos/oven-sh/bun/releases/latest -q .tag_name` | Tags read `bun-v1.4.4`. `@types/bun` takes the same version |
| npm packages | `bun outdated`, `npm view <package> version` | `npm view <package> dist-tags` shows the channels. TypeScript's `latest` tag is the stable one |
| Biome | `npm view @biomejs/biome version` | The `biome.json` schema URL carries the version |
| GitHub Actions | `gh api repos/<owner>/<action>/releases/latest -q .tag_name` | Pin the major tag |
| gitleaks rules | `gh api repos/gitleaks/gitleaks/releases/latest -q .tag_name` | Tags read `v8.30.1` |
| Feature-Action Architecture | `git ls-remote https://github.com/MairwunNx/Feature-Action-Architecture.git HEAD` | The submodule follows the default branch |
| Claude Code | `npm view @anthropic-ai/claude-code version` | Native builds come from `downloads.claude.ai/claude-code-releases/<version>/<platform>/claude`, with checksums in that version's `manifest.json` |
| Codex | `npm view @openai/codex version` | One npm launcher plus per-platform packages |
| Gemini CLI | `npm view @google/gemini-cli version` | |
| OpenCode | `npm view opencode-ai version` | One npm wrapper plus per-platform binaries |
| Cursor CLI | `curl -fsS https://cursor.com/install` | The script names the current build in its `downloads.cursor.com/lab/<version>/…` URL. Read it, never pipe it into a shell |
| Docker images | `https://hub.docker.com/v2/repositories/<namespace>/<name>/tags?page_size=100&ordering=last_updated` | `library/` for official images. Keep the tag's shape (`-alpine`, `-slim`) |
