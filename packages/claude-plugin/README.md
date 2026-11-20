# ctxray for Claude Code

The plugin brings [ctxray](https://github.com/MairwunNx/ctxray) into your Claude Code sessions:

- A row above the prompt shows what the context is made of and how much of the window it takes. `/ctxray-loadout` opens the Loadout pane beside the chat: every share with its tokens, the instruction files with their `@` imports, MCP servers, and skills. Claude Code counts every number there itself. It needs Claude Code 2.1.286 or newer, an older one skips it.
- `/ctxray` shows what this session loaded into the context: system prompt, tools, rules and why each loaded, skills, MCP servers, with tokens. ctxray's own pieces are listed apart and don't count.
- `/ctxray-test` runs the project's ctxray tests and explains what failed.
- Claude learns to write `*.ctxray.ts` tests, and gets an MCP server with `inspect`, `run`, and `diff`, so it can check that a change didn't bloat the context.
- Its hooks log your sessions for `ctxray spectate`, on this machine only. They record which instruction files loaded and the length of each prompt, never its text.

The plugin runs the `ctxray` binary, so install ctxray first and make sure `ctxray --version` works in your shell.

```sh
claude plugin marketplace add MairwunNx/ctxray
claude plugin install ctxray@ctxray
```

Without network access, load the zip from a release: `claude --plugin-dir ctxray-claude-plugin.zip`.

`/ctxray` reads the requests Claude Code writes into the session's transcript. ctxray checks it on Claude Code 2.1.311 and 2.1.325. An older version may not write them, and `/ctxray` then says so.
