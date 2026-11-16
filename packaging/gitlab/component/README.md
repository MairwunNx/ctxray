# ctxray for GitLab CI

[ctxray](https://github.com/MairwunNx/ctxray) shows what Claude Code, Codex, Cursor, Gemini CLI, and OpenCode load into a model's context, and tests it in CI. This component runs `ctxray test` in your pipeline:

```yaml
include:
  - component: gitlab.com/mairwunnx/ctxray/ctxray@__VERSION__
    inputs:
      args: --layer L1-L3
```

The job caches the harnesses your `ctxray.lock` pins and hands the JUnit report to GitLab. Inputs:

| Input | Default | What it does |
| --- | --- | --- |
| `stage` | `test` | The stage the job runs in |
| `version` | `__VERSION__` | The ctxray version, which picks the image |
| `image` | `ghcr.io/mairwunnx/ctxray` | The image without its tag, a mirror in your registry for example |
| `args` | empty | Arguments for `ctxray test` |

This project mirrors [MairwunNx/ctxray](https://github.com/MairwunNx/ctxray): issues and changes go there. The [CI Integration](https://github.com/MairwunNx/ctxray/wiki/CI-Integration) page of the manual covers closed networks.
