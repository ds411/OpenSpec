---
'@fission-ai/openspec': minor
---

New `/opsx:scan` agent command: a lead agent and a team of helper agents scan a repository with full, partial or no OpenSpec coverage, write Gherkin requirements for the behavior the code has now, and add `@trace` comments at the code that implements each one. It is a command file only, never a skill, so nothing loads into the agent context until you run it. `openspec init` and `openspec update` write it for every configured tool with command files, whatever the profile and delivery settings are; in Claude Code it sets `disable-model-invocation: true`.
