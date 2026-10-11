# AGENT.md

## Project

- Project: `school-bike-rent-international`
- Stack: Vue 3 + Vite frontend, Node.js + Express backend, MySQL

## Runtime

- Backend port: `8032` from `backend/.env.example` `PORT`.
- Frontend port: `4030` from `frontend/vite.config.js`.
- Backend dev: `cd backend && npm run dev`.
- Frontend dev: `cd frontend && npm run dev`.

### Frontend API routing

`src/api/client.js` defaults to the relative `/api` path. Both the Vite dev server and preview
server proxy `/api` to `http://localhost:8032`, keeping the phone/WebView request same-origin
with the web page and avoiding cross-origin LAN restrictions.

For deployment, serve the frontend on port 4030 and the API on port 8032 on the same host. If the
API is hosted elsewhere, set `VITE_API_BASE` at build time to its HTTPS URL and configure CORS.

The `preview.proxy` entry matters for the Android WebView deployment; do not remove it while
keeping the relative API base.

## Database

- Type: MySQL.
- Database name: `student_bike_rental`.
- Env file: `backend/.env` based on `backend/.env.example`.
- Variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`.
- Schema: `backend/sql/schema.sql`.
- Schema versions: `backend/sql/migrations/` and `schema_migrations`; append numbered SQL files and never edit an applied migration.
- Seed: `backend/sql/seed.sql`, plus `npm run seed` and `npm run seed:demo`.
- `npm run db:init` creates/uses the configured `DB_NAME`, applies checksum-verified migrations under a MySQL advisory lock, then applies idempotent baseline seed rows.
- `npm run smoke` exercises student/admin login, pagination envelopes and cross-page separation for bikes, stations, announcements, personal orders, users, admin orders, and maintenance records, plus rent/return and order authorization; it refuses to run unless `DB_NAME` ends in `_test`.
- `npm run test:concurrency` races two rentals for one user and verifies the database invariant; it also requires `_test` and a seeded student account.
- Rental transactions lock the `users` row before the bike row. Keep this lock order; `uniq_rental_orders_active_user` is the database backstop that permits at most one `renting` order per user.
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

## Port allocation

Web: 4030. API/services: 8032. See `PORTS.md`; keep dev/preview ports fixed and fail on conflicts.
