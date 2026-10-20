---
'@fission-ai/openspec': minor
---

New `openspec trace` commands check the link between requirements and code. Code names a requirement with a `@trace REQ-0001` comment in any comment style. `openspec trace check` fails when a requirement has no trace or a trace names an ID that does not exist (`--untraced` and `--orphans` run one check only), `openspec trace show <id>` lists the code that traces to a requirement, and `openspec trace report` gives traced and total requirements per capability. All three take `--json`. The scanner reads the files git tracks and new files that `.gitignore` allows; the optional `trace.include` and `trace.exclude` globs in `openspec/config.yaml` narrow the scope. Requirements tagged `@notrace` are not checked, and requirements that an active change adds or removes are reported as pending or as warnings, not as errors.
