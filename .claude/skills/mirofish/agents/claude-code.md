# Claude Code Adapter

Use this folder as a skill package.

Start by reading `../SKILL.md`. Then load reference files only when the task needs them:

- `../references/offline-playbook.md` for the default no-backend workflow
- `../references/worked-example.md` for a text-first worked example
- `../references/output-patterns.md` for deliverable formats
- `../references/workflow-map.md` when the user explicitly wants the repository-backed workflow
- `../references/api-surface.md` and `../references/runtime-contract.md` only for live backend execution
- `../references/execution-playbook.md` only when orchestrating the backend stages

Invocation prompt:

```text
Use the MiroFish skill in this folder. Read SKILL.md first, then use the referenced files needed for the task. Turn seed material into a MiroFish-style prediction workflow, defaulting to the offline path unless live backend execution is explicitly requested.
```
