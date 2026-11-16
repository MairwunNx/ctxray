---
name: ctxray-test
description: Run the project's ctxray tests and explain what failed
disable-model-invocation: true
argument-hint: "[flags for ctxray test, like --layer L1,L2,L3]"
allowed-tools: Bash(ctxray test *)
---

Run `ctxray test $ARGUMENTS` from the project root with the Bash tool.

When every test passes, say so in one line. Otherwise, for each failed test give its name, layer, and harness, what it expected and what it got, and the smallest change to the rules, skills, or test that would fix it. Don't change any file unless the user asks.
