# Deploying Dislocator to free hosting

This guide publishes the app on the public internet using three free services,
all with HTTPS, and a database that is **never wiped by inactivity**:

| Piece | Service | Free tier | Notes |
|---|---|---|---|
| Database (PostgreSQL) | **Neon** | 0.5 GB+ storage, data kept indefinitely | Compute "scales to zero" after 5 min idle and wakes on the next query; **data is never deleted for inactivity**. |
| Backend (Go API) | **Render** (Docker web service) | 750 hours/month, 512 MB RAM, no credit card | Sleeps after ~15 min idle; first request then takes ~30–50 s (cold start). |
| Frontend (React SPA) | **Netlify** (static site) | Generous free static hosting, HTTPS | Cloudflare Pages or Vercel work equally well (see alternatives at the end). |

All three provide managed HTTPS automatically, so the "HTTPS only" requirement
is satisfied without any certificate work on your side.

```
  Browser ──HTTPS──▶ Netlify (frontend SPA)
     │
     └──HTTPS──▶ Render (Go backend /api) ──▶ Neon (PostgreSQL)
```

The migrations and the initial admin user are created automatically the first
time the backend starts against the Neon database — you do not run any SQL by
hand.

---

## Before you start

You need free accounts on **GitHub**, **Neon**, **Render**, and **Netlify**
(sign in to each with GitHub to keep it simple).

The repo already contains everything needed for deployment:

- `backend/Dockerfile` — builds the Go API.
- `render.yaml` — Render Blueprint for the backend.
- `netlify.toml` + `frontend/public/_redirects` — Netlify build + SPA routing.

### Step 0 — Push the code to GitHub

Render and Netlify deploy from a Git repository, so the project must live on
GitHub. From the project folder:

```bash
git init                     # if not already a git repo
git add -A
git commit -m "Dislocator app"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/dislocator.git
git branch -M main
git push -u origin main
```

---

## Step 1 — Create the database (Neon)

1. Go to <https://neon.com> and sign up.
2. Create a **Project** (any name, pick the region closest to your users).
   A database named `neondb` is created for you.
3. On the project **Dashboard**, click **Connect** and copy the
   **connection string**. It looks like:

   ```
   postgresql://<user>:<password>@ep-xxxx-xxxx.<region>.aws.neon.tech/neondb?sslmode=require
   ```

   Keep the `?sslmode=require` at the end — the backend needs it. Save this
   string; it is your `DATABASE_URL`.

That is all for the database. Nothing else to configure — the backend creates
the tables on first start.

---

## Step 2 — Deploy the backend (Render)

1. Go to <https://render.com>, sign in with GitHub.
2. Click **New → Blueprint**, choose your `dislocator` repository. Render reads
   `render.yaml` and proposes a service named **dislocator-api**.
3. When prompted, fill in the environment variables:
   - **DATABASE_URL** → the Neon connection string from Step 1.
   - **FRONTEND_URL** → put a placeholder for now, e.g. `https://example.com`
     (you will fix this in Step 4 once the frontend URL exists).
   - **ADMIN_PASSWORD** → a strong password for your first admin login.
   - `JWT_SECRET` is generated automatically; `ADMIN_LOGIN` defaults to `admin`.
4. Click **Apply / Create**. Render builds the Docker image and starts the
   service. First build takes a few minutes.
5. When it is live, copy the service URL, e.g.
   `https://dislocator-api.onrender.com`. Verify it works by opening
   `https://dislocator-api.onrender.com/api/health` — it should return
   `{"status":"ok"}`.

> If you prefer not to use the Blueprint: **New → Web Service**, pick the repo,
> set **Root Directory** = `backend`, **Runtime** = Docker, **Instance Type** =
> Free, and add the same environment variables by hand
> (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `ADMIN_LOGIN`, `ADMIN_PASSWORD`).

---

## Step 3 — Deploy the frontend (Netlify)

1. Go to <https://netlify.com>, sign in with GitHub.
2. **Add new site → Import an existing project**, pick the `dislocator` repo.
   Netlify reads `netlify.toml`, so the base directory (`frontend`), build
   command (`npm run build`) and publish directory are already set.
3. Before the first deploy, open **Site configuration → Environment variables**
   and add:
   - **VITE_API_BASE** = `https://dislocator-api.onrender.com/api`
     (your Render URL from Step 2, **with `/api` on the end**).
4. Trigger a deploy (**Deploys → Trigger deploy → Deploy site**, or it deploys
   automatically). When done, copy the site URL, e.g.
   `https://dislocator.netlify.app`. You can rename the site under
   **Site configuration → Change site name**.

> The `VITE_API_BASE` value is baked into the frontend at build time, so if you
> change it later you must trigger a new deploy.

---

## Step 4 — Connect the two (fix FRONTEND_URL) and go live

The backend needs to know the real frontend URL for two reasons: it allows that
origin through CORS, and it builds the sign-up links from it.

1. Back in Render → **dislocator-api → Environment**, set **FRONTEND_URL** to
   your Netlify URL from Step 3 (e.g. `https://dislocator.netlify.app`, no
   trailing slash).
2. Save — Render redeploys automatically.

Now open your Netlify URL in a browser. You should see the login page.

### First login and creating users

1. Log in with **`admin`** and the **ADMIN_PASSWORD** you set in Step 2.
2. Use the gear menu (top-right) → **Загрузить файл** to upload your `.xlsx`,
   and **Пригласить пользователя** to generate sign-up links for viewers and
   other admins. Each link is single-use and expires in 24 hours; the invitee
   opens it and sets their own login and password.

Your site is now public. Share the Netlify URL (and sign-up links) with your
users.

---

## Free-tier behavior to expect

- **First request after idle is slow.** The Render free instance sleeps after
  ~15 minutes and Neon suspends compute after 5 minutes. The first request wakes
  both, so it can take up to a minute; everything is fast afterwards. This is
  normal for free tiers and does not lose any data.
- **Data persists.** Uploaded rows and user accounts live in Neon and are kept
  indefinitely on the free plan.
- **HTTPS everywhere.** Neon, Render and Netlify all serve HTTPS by default and
  redirect HTTP to HTTPS.

If you later want to avoid cold starts, the cheapest upgrade is Render's paid
"Starter" instance (always-on) while keeping Neon and Netlify free.

---

## Custom domain (optional)

Both Netlify and Render support free custom domains with automatic HTTPS. If you
add one to the frontend, remember to update **FRONTEND_URL** on Render (and, if
you also move the API to a custom domain, **VITE_API_BASE** on Netlify, then
redeploy the frontend).

---

## Updating the app later

Because both hosts deploy from GitHub, shipping a change is just:

```bash
git add -A && git commit -m "..." && git push
```

Render rebuilds the backend and Netlify rebuilds the frontend automatically.
Database migrations run on backend startup, so schema changes apply themselves.

---

## Troubleshooting

- **Login page loads but every request fails / CORS error in the browser
  console** → `FRONTEND_URL` on Render does not exactly match your Netlify URL
  (check https vs http and no trailing slash), or `VITE_API_BASE` on Netlify is
  wrong. Fix and redeploy the affected service.
- **`{"error":"DATABASE_URL is required"}` or backend crash on start** → the
  `DATABASE_URL` env var is missing or malformed on Render. Make sure it is the
  full Neon string including `?sslmode=require`.
- **First request hangs for ~30–60 s** → cold start (see above); retry once the
  service is awake.
- **Health check:** `https://<your-render-url>/api/health` should return
  `{"status":"ok"}` whenever the backend is awake.

---

## Alternatives (all free)

- **Database:** Supabase (Postgres; note its free projects *pause* after ~1 week
  idle and must be manually resumed, unlike Neon), Aiven.
- **Backend:** Koyeb (one free service, no credit card), Fly.io.
- **Frontend:** Cloudflare Pages or Vercel — both read `frontend/public/_redirects`
  or their own config for SPA routing; set `VITE_API_BASE` the same way. For
  Cloudflare Pages set build command `npm run build`, output directory
  `frontend/dist`, and root directory `frontend`.
