# MiroFish Repo Map

## What this project is

MiroFish is a multi-agent simulation and prediction app with a Vue frontend and Flask backend.

## Important files

- `package.json`: root scripts for setup, dev, and build
- `frontend/package.json`: Vite/Vue frontend scripts
- `backend/run.py`: backend entrypoint and config validation
- `backend/app/config.py`: environment validation and app config
- `.env.example`: required and optional environment variables
- `Dockerfile`: container build and start flow
- `docker-compose.yml`: one-service compose deployment
- `README.md` / `README-ZH.md`: user-facing setup and workflow

## Root scripts

- `npm run setup`: install root and frontend Node deps
- `npm run setup:backend`: create/sync backend Python env with uv
- `npm run setup:all`: run both setup steps
- `npm run dev`: start backend and frontend together
- `npm run backend`: backend only
- `npm run frontend`: frontend only
- `npm run build`: build frontend

## Required env vars

- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL_NAME`
- `ZEP_API_KEY`

## Optional env vars

- `LLM_BOOST_API_KEY`
- `LLM_BOOST_BASE_URL`
- `LLM_BOOST_MODEL_NAME`

## Default ports

- Frontend: `3000`
- Backend: `5001`

## Working rules

- Prefer source mode when debugging or changing code.
- Prefer Docker mode when the user only needs a runnable deployment.
- Always verify `.env` first when the backend refuses to start.
