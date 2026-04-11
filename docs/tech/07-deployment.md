# Deployment

How the project is deployed on the VPS using Dokploy.

## Overview

```
GitHub (juniorspy/neo-farmacia)
        │
        │ push to main
        ▼
┌────────────────────────────────────────┐
│  VPS with Dokploy                      │
│                                        │
│  Project: neofarmacia                  │
│  ├── Application: api                  │
│  ├── Application: dashboard            │
│  ├── Compose: infra (MongoDB, Redis)   │
│  └── Compose: pos (Odoo + PostgreSQL)  │
│                                        │
│  All on dokploy-network                │
│  Traefik routes by Host header         │
│  Let's Encrypt for TLS                 │
└────────────────────────────────────────┘
```

## Live URLs

| Service | URL | Port (internal) |
|---|---|---|
| API | `https://api.leofarmacia.com` | 3000 |
| Dashboard | `https://app.leofarmacia.com` | 3000 |
| Odoo | `https://pos.leofarmacia.com` | 8069 |

## Dokploy services

### `api` — Application
- **Source**: GitHub → `juniorspy/neo-farmacia`, branch `main`
- **Build Path**: `./packages/api`
- **Build Type**: Dockerfile
- **Dockerfile Path**: `./Dockerfile`
- **Network**: `dokploy-network`
- **Domain**: `api.leofarmacia.com` → port 3000, HTTPS
- **Auto Deploy**: On push to main

#### Environment variables
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
MONGODB_URI=mongodb://neofarmacia-infra-lm1k14-mongodb-1:27017/neo_farmacia
REDIS_URL=redis://neofarmacia-infra-lm1k14-redis-1:6379
ODOO_URL=http://neofarmacia-pos-823krk-odoo-1:8069
ODOO_DB=odoo
ODOO_USER=admin
ODOO_PASSWORD=admin
JWT_SECRET=<strong-random-string>
EVOLUTION_API_URL=https://evo.onrpa.com
EVOLUTION_MASTER_KEY=<evolution-key>
N8N_WEBHOOK_URL=<n8n-webhook>
```

Hostnames like `neofarmacia-infra-lm1k14-mongodb-1` come from Dokploy's auto-generated Docker Compose container names. If you recreate a service, the suffix may change — update accordingly.

### `dashboard` — Application
- **Source**: GitHub → `juniorspy/neo-farmacia`, branch `main`
- **Build Path**: `./packages/dashboard`
- **Build Type**: Dockerfile
- **Dockerfile Path**: `./Dockerfile`
- **Network**: `dokploy-network`
- **Domain**: `app.leofarmacia.com` → port 3000, HTTPS
- **Auto Deploy**: On push to main

#### Environment variables
```
NEXT_PUBLIC_API_URL=https://api.leofarmacia.com
```

**Important**: `NEXT_PUBLIC_*` vars are baked into the JavaScript bundle at build time. The Dockerfile also hardcodes this as an `ARG` default — so even if Dokploy doesn't pass the env var to the build step, it falls back to the correct URL.

If you ever change the API URL, update both:
1. The Dokploy environment variable
2. The `ARG NEXT_PUBLIC_API_URL=...` default in `packages/dashboard/Dockerfile`

### `infra` — Compose
MongoDB + Redis. Managed separately because they persist data. Not connected to GitHub — edit the compose YAML directly in Dokploy.

### `pos` — Compose
Odoo 17 + PostgreSQL. Same reasoning as infra.

## Deployment flow

1. Developer pushes to `main` on GitHub
2. GitHub webhook notifies Dokploy
3. Dokploy triggers a build for any Application with `Auto Deploy: On push`
4. Build uses the configured Dockerfile in its Build Path
5. On success, Dokploy stops the old container and starts the new one
6. Traefik automatically routes traffic to the new container
7. Old container is removed

Zero-downtime is not guaranteed — for a fast-moving API this is fine, but for high-traffic production we'd want health checks and blue-green.

## Common operations

### Force rebuild without pushing
In Dokploy → service → **Deploy** or **Rebuild** button. Useful when you changed only environment variables.

### Watch logs
In Dokploy → service → **Logs** tab. Shows `docker logs` output in real time.

### Change environment variable
1. Service → **Environment** tab
2. Edit
3. Click **Deploy** (restart alone isn't enough — container needs to re-start with new env)

### Roll back
Currently manual: `git revert` + push, or change branch to a previous commit.

## Common pitfalls

### `neofarmacia-api:latest` image not found
Happened once when the api was on a manual compose with a locally-built image. Solution: convert to GitHub-based Application.

### `could not translate host name "odoo-db"`
Wrong container name in `ODOO_URL`. Dokploy auto-names containers with a suffix per deploy; always copy the exact name from the pos service.

### Routes get duplicated error
Happened when two modules declared the same route. Fastify is strict — remove the duplicate in one of them.

### Dashboard still calls `localhost:3001`
`NEXT_PUBLIC_API_URL` not set at build time. Fix: make sure the Dockerfile has the ARG with a correct default, then rebuild (not just restart).

### Traefik 502 Bad Gateway
Container crashed on startup. Check logs in Dokploy. Usually env var or network issue.

## Security notes

- `JWT_SECRET` must be strong and kept out of git
- The default admin password `admin123` should be changed after the first login (manual DB update for now — no password change UI yet)
- Public endpoints (webhook, n8n callbacks) have no auth today — should be protected by shared secret or IP allowlist when exposed beyond dev
- Dokploy-network is a Docker bridge network, not encrypted inside the VPS — that's fine on a single-host setup
