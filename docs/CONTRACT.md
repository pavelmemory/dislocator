# Dislocator — Shared Contract (v1)

Both backend and frontend implement against this document. `docs/columns.json` is the machine-readable column list; this file describes behavior, DB schema, and the HTTP API.

## 1. Domain / column model

- Source file: single sheet `Висновок`, two header rows (row 1 = group/standalone labels, row 2 = sub-labels for grouped columns), data starts at **row 3**.
- Column 1 `№ п/п` is **skipped** — not parsed, not stored.
- 34 stored columns, defined in `docs/columns.json` (ordered). Each has:
  - `key` — ascii identifier (DB column name + JSON field name).
  - `group` — top-level header for two-level display (`ВРП ВУ-23`, `ВРП ВУ-36`) or `null`.
  - `label` — Russian display name (exact xlsx sub-header).
  - `type` — `text` | `integer` | `date` | `datetime`.
  - `search` — `multi` (text/integer) or `range` (date/datetime).
  - `xlsx_col` — 1-based source column index.
- Both apps MUST derive columns from this list (backend embeds `columns.json`; frontend imports it) so ordering and metadata never drift. Backend also exposes it via `GET /api/columns`.

### Types & formatting
- `integer`: stored `BIGINT` nullable. Displayed as-is.
- `text`: stored `TEXT` nullable. Trailing/leading whitespace trimmed on import.
- `date`: stored `DATE` nullable. Displayed `DD.MM.YYYY`.
- `datetime`: stored `TIMESTAMP` (no tz) nullable. Displayed `DD.MM.YYYY HH:mm`. (Times shown `hh:mm`.)
- Empty xlsx cells → `NULL`.

## 2. Database schema (Postgres 16)

Migrations live in `backend/migrations` (`0001_init.up.sql` etc.). Applied automatically by backend on startup.

```sql
CREATE TABLE users (
  login         TEXT PRIMARY KEY,           -- business PK, unique
  password_hash TEXT NOT NULL,              -- bcrypt
  role          TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signup_links (
  token       UUID PRIMARY KEY,             -- random, unguessable
  role        TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  expires_at  TIMESTAMPTZ NOT NULL,         -- created_at + 24h
  used_at     TIMESTAMPTZ,                  -- NULL until consumed
  created_by  TEXT NOT NULL REFERENCES users(login),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE imports (
  id           BIGSERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES users(login),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE dislocation (
  id         BIGSERIAL PRIMARY KEY,
  import_id  BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  -- ... 34 columns from columns.json, e.g.:
  wagon_number BIGINT,
  rps          TEXT,
  operation_date TIMESTAMP,
  planned_repair_date DATE,
  -- ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON dislocation (import_id);
-- helpful indexes on commonly filtered/sorted cols (wagon_number, operation_date, ...).
```

Seed: on startup, if user `test` does not exist, create it with role `admin`, password `test` (bcrypt). Idempotent.

## 3. Auth

- Login → `POST /api/auth/login` returns a **JWT access token** (HS256, secret from env `JWT_SECRET`, TTL 12h) with claims `{ sub: login, role, exp }`.
- Frontend stores the token and sends `Authorization: Bearer <token>` on every request.
- Middleware: `requireAuth` (valid token) and `requireAdmin` (role=admin). Viewer and admin can read data; only admin can upload and create signup links.

## 4. HTTP API

Base path `/api`. All JSON. Errors: `{ "error": "message" }` with appropriate status (400/401/403/404/409/422/500).

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET  | `/api/health` | none | — | `{ "status": "ok" }` |
| GET  | `/api/columns` | none | — | contents of columns.json `.columns` |
| POST | `/api/auth/login` | none | `{ login, password }` | `{ token, role, login }` |
| GET  | `/api/auth/me` | auth | — | `{ login, role }` |
| POST | `/api/admin/signup-links` | admin | `{ role: "admin"\|"viewer" }` | `{ token, role, expires_at, url }` |
| GET  | `/api/signup-links/:token` | none | — | `{ role, expires_at, valid: bool }` (checks not expired/used) |
| POST | `/api/register` | none | `{ token, login, password }` | `201 { login, role }`; 409 if login taken; 410 if link invalid/expired/used |
| POST | `/api/admin/imports` | admin | multipart `file` (.xlsx) | `201 { import_id, row_count }`; 422 on parse errors with details |
| GET  | `/api/data` | auth | see §5 | `{ rows: [...], total, page, page_size }` |

### Register flow
1. Admin `POST /api/admin/signup-links {role}` → gets `token` + `url` = `${FRONTEND_URL}/register?token=<token>`.
2. Invitee opens url; frontend `GET /api/signup-links/:token` to validate & show role; on submit `POST /api/register {token,login,password}`.
3. Register: verify link valid (exists, `used_at IS NULL`, `expires_at > now()`); login unique; create user with the link's role; set `used_at=now()`. Password min length 4 (prototype).

### Upload / parse rules
- Accept `.xlsx`. Parse sheet `Висновок` (or first sheet). Skip rows 1–2. For each data row where `№ вагона` (xlsx col 2) is non-empty, map xlsx_col → key per columns.json, coercing to the column type. Trim text. Cells that fail integer/date coercion when the cell is non-empty → record a row-level warning but still import the row with NULL for that cell (don't abort the whole file). Create one `imports` row; insert all data rows with that `import_id` (**append**, never delete existing). Return `row_count`.

## 5. `GET /api/data` — query semantics

Query params:
- `page` (1-based, default 1), `page_size` (default 50; allowed 25,50,100,200).
- Sorting: `sort=key1:asc,key2:desc,...` — applied in order. Invalid keys ignored. Default sort `id:asc`.
- Filtering, per column `key`:
  - **text / integer (`search=multi`)**: `f_<key>=v1,v2,v3` — OR of values. Text → case-insensitive **contains** (`ILIKE '%v%'`). Integer → exact match (`= v`); non-numeric values in the list are ignored. Values are comma-separated; a literal comma can be omitted (prototype).
  - **date / datetime (`search=range`)**: single value `f_<key>=YYYY-MM-DD` (matches that whole day) OR range `f_<key>_from=YYYY-MM-DD&f_<key>_to=YYYY-MM-DD` (**inclusive**). For datetime columns, `from` = start of day, `to` = end of day (23:59:59.999). Either bound may be omitted for open-ended.
- All active filters are AND-combined across columns.
- Response `rows`: array of objects keyed by column `key`. Date/datetime returned as **ISO 8601 strings** (`2026-09-01T06:23:00`), integers as numbers, text as strings, missing as `null`. Also include `id`.
- `total` = count matching filters (ignoring pagination).

## 6. Frontend URL sharing

The table view state that IS shareable (encoded in the URL query string, reproduced on load): all column filters, sort spec, page, page_size. Column show/hide is **NOT** shared — it is a per-browser preference in `localStorage`. The frontend uses the same param names as the API where practical so the URL is the query.

## 7. Frontend behavior notes

- Language: Russian throughout.
- Table: two-level header when `group` is set (group cell spans its consecutive sub-columns). Row hover highlight. Search-term highlight in matched text cells.
- Show/hide columns: toggled from the table header UI, persisted in `localStorage`. A "Показать скрытые столбцы" control reveals all hidden columns.
- Pagination controls with page size selector (25/50/100/200), default 50.
- Admin-only UI: "Загрузить файл" upload button + "Создать ссылку" (signup link generator with role choice, shows copyable URL).
- Dates `DD.MM.YYYY`, datetimes `DD.MM.YYYY HH:mm`.

## 8. Env vars

Backend: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `PORT` (default 8080).
Frontend (build-time): `VITE_API_BASE` (default `/api` — same origin behind Caddy).
