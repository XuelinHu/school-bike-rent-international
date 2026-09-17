# AGENT.md

## Project

- Project: `school-bike-rent-international`
- Stack: Vue 3 + Vite frontend, Node.js + Express backend, MySQL

## Runtime

- Backend port: `8032` from `backend/.env.example` `PORT`.
- Frontend port: `4030` from `frontend/vite.config.js`.
- Backend dev: `cd backend && npm run dev`.
- Frontend dev: `cd frontend && npm run dev`.

### ⚠️ Frontend does NOT use the Vite proxy

`vite.config.js` defines `proxy: { '/api': ... }`, but **nothing uses it** — `src/api/client.js`
builds an absolute URL from `VITE_API_BASE` (default `http://localhost:8032/api`).
Dev requests are therefore real cross-origin requests, allowed by the backend's `cors()`.

Consequences worth remembering:

- Deploying to a phone without setting `VITE_API_BASE` makes the app call the phone itself.
  See `frontend/.env.example`.
- Because it is cross-origin, every `POST` to the AI endpoint shows up twice in network traces
  (`OPTIONS 204` preflight + the real `POST`). That is normal, not a duplicate request.
- The stale proxy block is harmless but misleading; do not "fix" the app by switching to
  relative `/api` paths without also changing the deployment story.

## Database

- Type: MySQL.
- Database name: `student_bike_rental`.
- Env file: `backend/.env` based on `backend/.env.example`.
- Variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`.
- Schema: `backend/sql/schema.sql`.
- Seed: `backend/sql/seed.sql`, plus `npm run seed` and `npm run seed:demo`.
- Keep real passwords only in local `.env`.

## AI Assistant (backend/src/ai)

- Entry points: `GET /api/ai/models` (public), `POST /api/ai/chat` (login + rate limited),
  `GET /api/ai/status` and `POST /api/ai/models/:name/load|unload` (admin only).
- Provider adapters under `ai/provider/`; `ai/agent.js` runs the tool-calling loop and is
  provider-agnostic. **Never parse provider payloads outside the adapters.**
- Tool definitions live in `ai/tools/index.js`, keyed by name. `toolsForRole()` trims them by
  role and **must** inject `name` (the registry entries do not carry it themselves).
- Streaming is NDJSON, not SSE — `EventSource` cannot send an `Authorization` header.

### Two traps that cost real debugging time

- **`num_ctx` is a LOAD parameter, not a sampling parameter.** Sending a value that differs from
  the resident instance makes Ollama unload and reload the whole model. This GPU is shared, so
  that reload can hang forever (heartbeats keep flowing, the first token never arrives).
  Default `AI_NUM_CTX=0` means "do not send it" and reuse whatever is resident. Only set a
  concrete value when the GPU is exclusively yours.
- **Ollama sends no response headers until the model is fully loaded.** A read-loop idle timeout
  therefore cannot catch a stuck model load; the header phase needs its own timeout
  (`fetchWithHeaderTimeout` in `ai/provider/ollama.js`).

Also: `stripThinking()` must not `trim()` — its input is a *streaming chunk*, and the leading
space in `" system"` is meaningful.

## Codex Notes

- Use transactions carefully for rent/return flows.
- If API base, ports, or schema changes, update README and this file.
- **Do not print or commit secrets.** Keys live only in the gitignored `backend/.env`.
- Ollama is reachable on `127.0.0.1:11434`. A public FRP tunnel for it exists at the user's
  own discretion — flag it if asked, do not change it unilaterally.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.
