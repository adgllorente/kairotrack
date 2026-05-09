# Kairotrack

Self-hosted, single-user time tracker. Web UI + REST API. Lightweight stack.

## About the name

**Kairotrack** comes from the Greek _kairós_ (καιρός) — "the right or opportune
moment" — as opposed to _chronos_, the sequential ticking of the clock. Where
chronos measures _how much_ time, kairos cares about _which_ time and what you
chose to do with it. Tracking your hours is really tracking your kairoi: the
moments you decide are worth spending. Hence Kairotrack.

## Stack

- **Backend:** Node.js 22, Hono, better-sqlite3 (SQLite, WAL), JWT cookie auth
- **Frontend:** React 18, Vite, Tailwind, shadcn-style UI, Recharts, TanStack Query, PWA
- **Storage:** Single SQLite file in `/data`
- **Container:** Multi-stage Docker, ~150MB image

## Features

- Single live timer (start/stop), manual entries, edit/delete
- Projects + optional tasks per track, notes, color coding
- Dashboard: bars, pie by project, line trend, GitHub-style heatmap
- Filters by project, date range
- CSV / JSON export
- Multiple API keys (label + revoke), `X-API-Key` or `Authorization: Bearer`
- Dark mode, responsive, installable PWA

## Quick start (Docker)

Pre-built images are published to **GitHub Container Registry** on every push to
`main` and on tagged releases:

```
ghcr.io/adgllorente/kairotrack:latest
ghcr.io/adgllorente/kairotrack:v1.0.0
```

Multi-arch (`linux/amd64`, `linux/arm64`).

If the package is private, authenticate first with a Personal Access Token that
has the `read:packages` scope:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-user> --password-stdin
```

### docker-compose.yml (recommended)

Drop this file anywhere, create a `.env` next to it, and `docker compose up -d`:

```yaml
services:
  kairotrack:
    image: ghcr.io/adgllorente/kairotrack:latest
    container_name: kairotrack
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      AUTH_USER: ${AUTH_USER:-admin}
      AUTH_PASSWORD: ${AUTH_PASSWORD:?set AUTH_PASSWORD in .env}
      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET in .env (32+ random chars)}
      TZ: ${TZ:-Europe/Madrid}
    volumes:
      - kairotrack_data:/data

volumes:
  kairotrack_data:
```

`.env` next to it:

```env
AUTH_USER=admin
AUTH_PASSWORD=replace-me
SESSION_SECRET=replace-with-openssl-rand-hex-32
TZ=Europe/Madrid
```

Generate the session secret with `openssl rand -hex 32`. Open
http://localhost:3000 and sign in with `AUTH_USER` / `AUTH_PASSWORD`.

### Single container (no compose)

```bash
docker run -d --name kairotrack \
  -p 3000:3000 \
  -e AUTH_USER=admin \
  -e AUTH_PASSWORD='your-strong-password' \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e TZ=Europe/Madrid \
  -v kairotrack_data:/data \
  ghcr.io/adgllorente/kairotrack:latest
```

### Build from source

```bash
git clone git@github.com:adgllorente/kairotrack.git && cd kairotrack
cp .env.example .env
# edit .env: set AUTH_PASSWORD and SESSION_SECRET (generate with: openssl rand -hex 32)
docker compose up -d --build
```

## Environment variables

| Var              | Required | Default               | Description                                                 |
| ---------------- | -------- | --------------------- | ----------------------------------------------------------- |
| `AUTH_USER`      | yes      | —                     | Username for the single user                                |
| `AUTH_PASSWORD`  | yes      | —                     | Plain password (hashed with bcrypt at boot, kept in memory) |
| `SESSION_SECRET` | yes      | —                     | Random 32+ byte secret used to sign session cookies         |
| `PORT`           | no       | `3000`                | HTTP port                                                   |
| `DB_PATH`        | no       | `/data/kairotrack.db` | SQLite file path                                            |
| `TZ`             | no       | `UTC`                 | Timezone for grouping in dashboard / heatmap                |

## REST API

Base: `/api`. Auth via session cookie (browser) or `X-API-Key: kt_<prefix>_<secret>` header (or `Authorization: Bearer ...`).

| Method                  | Path                                                                            | Description                                                       |
| ----------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `POST`                  | `/auth/login`                                                                   | `{ user, password }` → session cookie                             |
| `POST`                  | `/auth/logout`                                                                  | clear cookie                                                      |
| `GET`                   | `/auth/me`                                                                      | current user                                                      |
| `GET/POST/PATCH/DELETE` | `/projects[/<id>]`                                                              | projects                                                          |
| `GET/POST/PATCH/DELETE` | `/tasks[/<id>]?project_id=`                                                     | tasks                                                             |
| `GET`                   | `/tracks?from=&to=&project_id=&task_id=&limit=`                                 | list                                                              |
| `GET`                   | `/tracks/active`                                                                | currently running track or null                                   |
| `POST`                  | `/tracks/start`                                                                 | `{ project_id, task_id?, note? }`                                 |
| `POST`                  | `/tracks/stop`                                                                  | stop active                                                       |
| `POST`                  | `/tracks`                                                                       | manual `{ project_id, started_at, ended_at, ... }` (unix seconds) |
| `PATCH/DELETE`          | `/tracks/<id>`                                                                  | edit/delete                                                       |
| `GET`                   | `/stats/summary?group_by=day\|week\|month\|year\|project&from=&to=&project_id=` | aggregated time                                                   |
| `GET`                   | `/stats/heatmap?year=&project_id=`                                              | per-day seconds                                                   |
| `GET`                   | `/stats/totals?from=&to=`                                                       | totals                                                            |
| `GET`                   | `/export?format=csv\|json&from=&to=&project_id=`                                | download                                                          |
| `GET/POST/DELETE`       | `/keys[/<id>]`                                                                  | API key management                                                |

### API key example

```bash
curl -H "X-API-Key: kt_abc12345_xxx" http://localhost:3000/api/tracks/active
```

## Local development

```bash
npm install
npm run dev   # backend on :3000, frontend on :5173 (proxies /api)
```

Set the same env vars in `backend/.env` or your shell. The backend will create `./data/kairotrack.db` automatically when `DB_PATH` is unset.

## Backup

Stop the container (or use SQLite online backup) and copy the volume:

```bash
docker run --rm -v kairotrack_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar czf /backup/kairotrack-$(date +%F).tar.gz ."
```

## License

MIT
