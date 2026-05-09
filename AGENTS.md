# AGENTS.md

Bootstrap context for AI coding agents working on **Kairotrack**.

## What this is

Self-hosted, **single-user** time tracker. Web UI + REST API. Designed for low
resource usage and simple Docker deployment.

The name comes from Greek _kairós_ (the right moment) vs _chronos_ (sequential
time): tracking your hours is tracking your kairoi, the moments worth spending.

## Stack

- **Backend** (`backend/`): Node.js 22, ESM, TypeScript strict, Hono on
  `@hono/node-server`, `better-sqlite3` (WAL), `bcryptjs` for password + API
  key hashing, `jose` for JWT session cookies, Zod for validation.
- **Frontend** (`frontend/`): React 18, Vite 6, TypeScript strict, Tailwind +
  shadcn-style components (Radix primitives), Recharts, TanStack Query, React
  Router 7, sonner for toasts, `vite-plugin-pwa`.
- **Storage**: One SQLite file. Default `/data/kairotrack.db` in Docker,
  `./data/kairotrack.db` in dev.
- **Tooling**: ESLint 9 (flat config), Prettier 3, npm workspaces.
- **Container**: Multi-stage Dockerfile, runs as non-root `node` user, healthcheck.
- **CI**: `.github/workflows/docker.yml` builds multi-arch (`amd64`, `arm64`)
  and pushes to GHCR on push to `main` and on tags `v*`.

## Repo layout

```
backend/
  src/
    db/             schema.ts (embedded SQL), index.ts (DB setup, types)
    lib/            config (env loader), jwt, apikey, bcrypt
    middleware/     auth (session cookie or X-API-Key)
    routes/         auth, projects, tasks, tracks, stats, export, keys
    index.ts        Hono app, mounts /api/*, serves frontend dist
frontend/
  src/
    components/
      ui/           shadcn-style: button, card, dialog, alert-dialog, input,
                    label, select-native
      active-timer-bar.tsx   sticky top bar shown when a track is running
      confirm-button.tsx     wraps shadcn AlertDialog as a destructive confirm
      layout.tsx             sidebar + main, mobile-responsive
      theme-provider.tsx     light/dark/system, persisted in localStorage
    hooks/
      auth.ts       login/logout/me
      data.ts       projects, tasks, tracks, stats, keys
    lib/
      api.ts        fetch wrapper, types mirroring backend
      utils.ts      cn(), formatDuration, formatHours
    pages/          Login, Timer, Dashboard, History, Projects, Settings
    App.tsx         routes + Protected wrapper
    main.tsx        QueryClient + ThemeProvider + BrowserRouter + Toaster
.github/workflows/docker.yml
Dockerfile
docker-compose.yml          (build: . variant; README has GHCR variant)
eslint.config.js            (flat config, frontend/backend split)
.prettierrc.json
```

## Commands

Run from repo root unless noted.

```bash
# Install everything (workspaces)
npm install

# Dev: backend on :3000, frontend on :5173 with /api proxy
npm run dev

# Production build: frontend dist + backend dist
npm run build

# Run built backend (serves frontend from frontend/dist)
npm start

# Lint everything (typescript-eslint + react-hooks)
npm run lint
npm run lint:fix

# Format everything
npm run format        # write
npm run format:check  # CI-friendly

# Typecheck a single workspace
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

After any non-trivial code change run **lint + tsc + (build if frontend)**
before declaring done.

## Environment variables

Required for the backend to start (validated in `backend/src/lib/config.ts`):

| Var              | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `AUTH_USER`      | Username for the single user                               |
| `AUTH_PASSWORD`  | Plain password, hashed with bcrypt at boot, kept in memory |
| `SESSION_SECRET` | 32+ byte secret for JWT signing                            |

Optional: `PORT` (3000), `DB_PATH`, `TZ` (defaults to UTC; set to
`Europe/Madrid` for the maintainer), `COOKIE_SECURE` (`auto`|`true`|`false`,
default `auto`).

In dev the backend auto-loads `.env` from cwd or `../.env` (handwritten loader
in `config.ts`, no `dotenv` dependency).

## Auth model

Two paths, both go through `requireAuth` middleware in
`backend/src/middleware/auth.ts`:

1. **Session cookie** `tt_session`: HTTP-only, `Secure` in production,
   `SameSite=Lax`, 7-day JWT signed with `SESSION_SECRET`.
2. **API key** via `X-API-Key:` or `Authorization: Bearer ...` header.
   Format: `kt_<8-hex-prefix>_<base64url-secret>`. The parser also accepts a
   legacy `tt_` prefix so older keys keep working — see
   `backend/src/lib/apikey.ts`. Keys are stored hashed (bcrypt); only the
   prefix is queryable.

Login response sets the cookie; the frontend uses `credentials: 'include'`.
401 from `/api/*` redirects the SPA to `/login` (see `frontend/src/lib/api.ts`).

The `Secure` cookie flag is controlled by `COOKIE_SECURE` (default `auto`).
In `auto` mode the flag is set when the request itself looks HTTPS — either
`X-Forwarded-Proto: https` (set by a TLS-terminating reverse proxy) or a
direct `https://` URL. Plain HTTP requests (e.g. `http://192.168.x.x:3030`)
get a non-Secure cookie, so LAN deployments work without further config.
Force on/off with `COOKIE_SECURE=true|false`. **Pitfall:** if the proxy does
not forward `X-Forwarded-Proto`, set `COOKIE_SECURE=true` explicitly.

## DB schema

Embedded as a string in `backend/src/db/schema.ts` and applied with
`CREATE TABLE IF NOT EXISTS` on every boot. No migrations framework yet — if
you add a backwards-incompatible column, write a migration runner.

Tables: `projects`, `tasks` (FK to projects, `ON DELETE CASCADE`), `tracks`
(FK to projects `RESTRICT`, to tasks `SET NULL`), `api_keys`, `meta` (kv).

Key invariants:

- **At most one active track**: enforced by
  `CREATE UNIQUE INDEX uniq_tracks_active ON tracks(ended_at) WHERE ended_at IS NULL`.
  `POST /tracks/start` opens a transaction, stops the active track if any,
  then inserts the new one.
- **Soft delete**: deleting a project or task that still has tracks archives it
  (`archived_at = unixepoch()`) instead of removing the row. The `RESTRICT`
  FK plus the COUNT check handles both layers.
- All timestamps are **unix seconds** (`INTEGER`). Convert with
  `unixepoch()` (SQLite) or `Math.floor(Date.now() / 1000)` (JS).

## Stats grouping

`/api/stats/summary?group_by=day|week|month|year|project` uses SQLite
`strftime`/`date` with the `'localtime'` modifier, which honors the `TZ` env
var. Active tracks (`ended_at IS NULL`) contribute
`unixepoch() - started_at` for live totals.

The Dashboard:

- Shows total + entry count cards (no avg/day — weekends drag it down for
  intermittent workdays; if reintroducing, base it on _active_ days).
- Bar chart of time-by-bucket with a red dashed `ReferenceLine` showing the
  average across visible buckets.
- Pie by project, line trend, GitHub-style heatmap (custom CSS grid, not
  Recharts; 53 cols x 7 rows).

## Dialogs / confirms

**Never use `window.confirm`**. There is a shadcn-style `AlertDialog`
(`components/ui/alert-dialog.tsx`) and a `ConfirmButton` wrapper
(`components/confirm-button.tsx`) that exposes `onConfirm`, `title`,
`description`, `destructive`, etc. Use that for delete / revoke / dangerous
actions.

## Active timer banner

`components/active-timer-bar.tsx` is rendered inside the `Layout` and is
visible on every authenticated page. It polls `/api/tracks/active` every 30s
via TanStack Query and ticks a local `setInterval` for the live counter.
Color is emerald (chosen by the maintainer over the default primary).

## Frontend conventions

- Path alias `@/` → `frontend/src/`.
- Strict TS, `noUnusedLocals`, `noUnusedParameters`. Catch blocks that don't
  use the error variable should use `catch {}` (no bare `(e)`).
- Tailwind with shadcn-style HSL CSS variables (`index.css`). Dark mode via
  `class` on `<html>`.
- React Query default: `staleTime: 5_000`, no refetch on focus, retry once.
- Tracks listing default limit 500, capped at 5000.
- Don't add dialog `<Dialog>` _and_ `confirm()` together — pick `AlertDialog`.

## Backend conventions

- ESM with `.js` import suffixes (TS NodeNext compat with the tsconfig).
- Use prepared statements (`db.prepare(...)`); they're cached by
  better-sqlite3.
- Validate request bodies with `zod` + `@hono/zod-validator`. Don't trust the
  shape after parsing.
- Return JSON or error JSON with explicit status (`c.json({ error }, 400)`).

## Docker

Multi-stage:

1. Builder installs all deps (with `python3 make g++` for native modules) and
   runs `npm run build`.
2. Runtime reinstalls **prod-only** deps with the same toolchain, then
   removes the toolchain in the same layer to keep the image small. Copies
   the built `backend/dist` and `frontend/dist`. Exposes 3000, healthcheck
   hits `/api/health`. Runs as `node` user. `tini` as PID 1.

`/data` is a volume. `DB_PATH=/data/kairotrack.db` and
`FRONTEND_DIR=/app/frontend/dist` are baked in.

## CI / publishing

`.github/workflows/docker.yml`:

- Triggers: push to `main`, tags `v*`, PRs (build only, no push), manual.
- Builds `linux/amd64` and `linux/arm64` with QEMU.
- Pushes to `ghcr.io/${{ github.repository }}` (resolves to
  `ghcr.io/adgllorente/kairotrack`).
- Tags via `docker/metadata-action`:
  - Push to `main` → `main`, `sha-<short>`
  - Tag `v1.2.3` → `1.2.3`, `1.2`, `latest`, `sha-<short>`
  - Tag `v1.2.3-rc.1` (any tag with `-`) → `1.2.3-rc.1`, `sha-<short>` (no `latest`)
  - PR → `pr-<n>`, build-only, not pushed
  - `latest` only moves on stable tag pushes, never on main.
- Cache via GHA cache backend.

Repo is private → image is private. Pulls from another machine require a PAT
with `read:packages`.

## What not to change without a reason

- Schema column types (everything is `INTEGER` for timestamps; mixing in
  `TEXT` ISO strings is a bug magnet).
- The single-active-track unique index. It's the simplest correctness
  guarantee in the codebase.
- The auth middleware order: session cookie tried first, then API key. Don't
  reverse it without thinking about CSRF.
- `Secure` cookie flag policy. Default `auto` derives from request protocol /
  `X-Forwarded-Proto`. Override with `COOKIE_SECURE=true|false`; do not tie
  it back to `NODE_ENV`.

## Working agreements with the maintainer (Spanish-speaking)

- Responses tend to be in Spanish; keep code/comments in English.
- Prefers terse output, no emojis, no fluff.
- Wants explicit confirmation before destructive or remote actions
  (`git push`, `force-push`, deleting volumes, etc.).
- Run lint + format before committing. The repo is configured to be clean —
  keep it that way.
