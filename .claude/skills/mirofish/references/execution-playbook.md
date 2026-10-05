# MiroFish Execution Playbook

Use this file only when the user explicitly wants live execution against a running MiroFish backend. For normal skill use without a backend, use `offline-playbook.md` instead.

## One-pass flow

1. `POST /api/graph/ontology/generate`
2. `POST /api/graph/build`
3. `POST /api/simulation/create`
4. `POST /api/simulation/prepare`
5. `POST /api/simulation/start`
6. `POST /api/report/generate`
7. `POST /api/simulation/interview` or batch variants

## Practical rules

- Use the project-level flow when starting from raw seed files.
- Use the simulation-only flow when a `graph_id` already exists.
- Use report and interview endpoints only after the simulation state is ready.
- Poll async tasks instead of assuming completion.

## Polling targets

- Graph build: `GET /api/graph/task/<task_id>`
- Report generation: `POST /api/report/generate/status`
- Simulation preparation: `POST /api/simulation/prepare/status`

## What to check before continuing

- ontology exists and matches the scenario
- graph id was created successfully
- simulation has valid profiles and config
- runtime state is `ready` or `running`
- report status is `completed`

## Interview usage

- Use targeted interviews for contradictions or specific agents.
- Use batch interviews when comparing multiple competing roles.
- Use `interview/all` only when probing the entire world with the same question.
