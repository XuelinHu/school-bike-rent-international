# AGENT.md

## Project

- Project: `school-bike-rent-international`
- Stack: Vue 3 + Vite frontend, Node.js + Express backend, MySQL

## Runtime

- Backend port: `3000` from `backend/.env.example` `PORT`.
- Frontend port: `5173` from `frontend/vite.config.js`.
- Frontend proxy: `/api -> http://localhost:3000`.
- Backend dev: `cd backend && npm run dev`.
- Frontend dev: `cd frontend && npm run dev`.

## Database

- Type: MySQL.
- Database name: `student_bike_rental`.
- Env file: `backend/.env` based on `backend/.env.example`.
- Variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`.
- Schema: `backend/sql/schema.sql`.
- Seed: `backend/sql/seed.sql`, plus `npm run seed` and `npm run seed:demo`.
- Keep real passwords only in local `.env`.

## Codex Notes

- Use transactions carefully for rent/return flows.
- If API base, ports, or schema changes, update README and this file.

## GitHub Commit Language

- Use English for all GitHub commit messages and pull/push related commit notes.
