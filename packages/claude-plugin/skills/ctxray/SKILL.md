---
name: ctxray
description: Show what this session loaded into the context, piece by piece, with tokens
disable-model-invocation: true
allowed-tools: Bash(ctxray spectate *)
---

ctxray rebuilt the latest request of this session from its transcript:

!`ctxray spectate --session ${CLAUDE_SESSION_ID} --plugin-root "${CLAUDE_PLUGIN_ROOT}"`

Show the user this report exactly as printed, in a code block. Then add at most two sentences: what takes the most room, and one concrete way to shrink it if something stands out. Run nothing else.
