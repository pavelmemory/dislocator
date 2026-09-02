# Dislocator

Web application for uploading railway "dislocation" XLSX reports, storing the parsed
rows, and browsing them in a searchable, sortable Russian-language table.

- **Backend** — Go (chi, pgx, JWT, excelize). REST API under `/api`.
- **Frontend** — React + Vite + TypeScript (TanStack Table/Query). Separate SPA.
- **Database** — PostgreSQL 16.
- **Reverse proxy** — Caddy, terminating **HTTPS** (local internal CA) and routing
  `/api/*` to the backend and everything else to the frontend.

The whole prototype runs locally via Docker Compose. See `docs/CONTRACT.md` for the
full API/behavior specification and `docs/columns.json` for the column model.

## Quick start

Requires Docker + Docker Compose.

```bash
cp .env.example .env      # then edit JWT_SECRET
make up                   # build images and start db, backend, frontend, caddy
```

Open **https://localhost**.

Because Caddy uses its own local certificate authority, the browser will warn about the
certificate the first time. Accept it to proceed (or install Caddy's root CA to remove the
warning — the root cert lives in the `caddy_data` volume under
`/data/caddy/pki/authorities/local/root.crt`).

### First login

An admin account is seeded automatically on first startup:

- **Login:** `test`
- **Password:** `test`

As admin you can:

- **Загрузить файл** — upload an `.xlsx` in the expected format. Rows are parsed and
  **appended** to the existing data (each upload is recorded as a separate import).
- **Создать ссылку** — generate a one-time signup link for a new **viewer** or **admin**.
  The link expires in 24 hours. The invitee opens it and sets their own login + password.
  Logins are unique and are the account's primary key.

Viewers and admins can both browse, search, sort, and share views of the data.

## Table features

- Two-level headers matching the source file (including the `ВРП ВУ-23` / `ВРП ВУ-36` groups).
- Per-column search: text/number columns accept multiple values (OR); date/time columns
  accept a single date or an inclusive range.
- Multi-column sorting (ascending/descending per column).
- Show/hide columns (persisted in your browser) with a control to reveal all hidden columns.
- Row-hover highlight and search-term highlighting.
- Pagination (25/50/100/200 rows, default 50).
- **Shareable links** — the current filters, sort, and page are encoded in the URL, so a
  copied link reproduces the same view for another user (column show/hide is personal and
  not included).
- Dates shown as `DD.MM.YYYY`, times as `hh:mm`.

## Local development (without the full stack)

Backend:

```bash
cd backend
export DATABASE_URL='postgres://dislocator:dislocator@localhost:5432/dislocator?sslmode=disable'
export JWT_SECRET=dev-secret
export FRONTEND_URL=http://localhost:5173
go run ./cmd/server        # migrations + admin seed run on startup
```

Frontend:

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173, proxies /api -> :8080
```

## Project layout

```
backend/     Go API, migrations, Dockerfile
frontend/    React SPA, Dockerfile (nginx)
infra/       Caddyfile (HTTPS reverse proxy)
docs/        CONTRACT.md (spec) + columns.json (column model)
docker-compose.yml
```

## Deployment (free hosting)

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for step-by-step instructions to
publish the app for free on Neon (PostgreSQL, data kept indefinitely), Render
(Go backend, Docker), and Netlify (React frontend) — all with automatic HTTPS.
The repo includes `render.yaml`, `netlify.toml`, and `frontend/public/_redirects`
to make those deploys turnkey.
