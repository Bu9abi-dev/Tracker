# Agent Adapters

This folder contains optional adapter notes for different agent ecosystems.

The canonical skill entrypoint remains:

- `../SKILL.md`

Codex/OpenAI-compatible runners can use `openai.yaml` as UI metadata.

Claude Code, OpenClaw, and Hermes may ignore `openai.yaml`; for those systems, pass the matching adapter file together with `../SKILL.md` and the `../references/` folder.

Do not rewrite `SKILL.md` frontmatter for one ecosystem unless that copy is being packaged exclusively for that ecosystem.
