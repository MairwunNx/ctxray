# ctxray

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/MairwunNx/ctxray"></a>
  <img alt="Status: early development" src="https://img.shields.io/badge/status-early%20development-orange">
</p>

🩻 **ctxray** is an X-ray for agent harnesses. See exactly what your Claude Code, Codex, Cursor & co. loaded – and test it in CI.

[Русская версия](https://github.com/MairwunNx/ctxray/blob/master/README.RU.md)

> [!WARNING]
> ctxray is in early development and nothing is released yet. Until 1.0, the API may change in minor versions.

## Why

An agent harness builds the model's context out of rules, skills, MCP servers, commands, and its own system prompt. You don't see what it loaded, what that costs in tokens, or why a rule got in. ctxray shows you, and turns it into tests your CI runs on every merge request.

<!-- A recording of `ctxray inspect` goes here. -->

## Quick start

```sh
bunx @mairwunnx/ctxray inspect
```

Coming with the first release.

## The Loadout Stack

ctxray checks your agent setup in seven layers. Each one answers its own question, and each next one costs more.

| Layer | Question |
|---|---|
| L1 Lint | Are the rule, skill, and config files valid? |
| L2 Policy | Does the setup follow your organisation's rules? |
| L3 Resolve | What should load for these files? |
| L4 Assemble | What did the harness actually put into the request? |
| L5 Wire | Does the harness inject the right thing when the agent reads a file or calls a skill? |
| L6 Activate | Does the model pick the right skill for a prompt? |
| L7 Scenario | Does the agent get the task done the right way? |

## Documentation

Everything else lives in the [wiki](https://github.com/MairwunNx/ctxray/wiki).

## License

[MIT](LICENSE)
