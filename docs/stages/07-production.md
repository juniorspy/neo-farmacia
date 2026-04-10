# Stage 7: Production

**Status**: `pending`
**Depends on**: All previous stages
**Goal**: Everything running reliably in Docker on the VPS with monitoring.

## Deliverables

- [ ] `docker-compose.yml` with all services
- [ ] `docker-compose.prod.yml` with production overrides
- [ ] `.env.example` with all required variables documented
- [ ] Health check endpoints for every service
- [ ] Auto-restart policies for all containers
- [ ] Reverse proxy config (Traefik via Dokploy)
- [ ] SSL/TLS certificates (Let's Encrypt via Dokploy)
- [ ] MongoDB backup strategy (cron + volume mount)
- [ ] Log aggregation (container logs via Dokploy)
- [ ] RAM/Disk monitoring and alerts
- [ ] WebSocket proxy configuration in Traefik

## Docker Compose Services

```yaml
services:
  api:            # Fastify microservice
  dashboard:      # Next.js frontend
  odoo:           # Odoo 17
  postgres:       # PostgreSQL (for Odoo)
  mongodb:        # MongoDB (chats, users, sessions)
  redis:          # Redis (debounce, mutex, handover, cache)
  n8n:            # n8n (AI agents) — or use existing instance
  # evolution:    # Evolution API — likely shared with colmado
  # pos-sync:     # POS sync service (optional, per-client)
```

## VPS Requirements

- **Minimum RAM**: 16GB
- **Recommended RAM**: 32GB (if sharing VPS with other services)
- **Disk**: 50GB+ SSD (Odoo + MongoDB + PostgreSQL)
- **CPU**: 4+ cores

## Memory Budget

```
Odoo + PostgreSQL:     ~2-2.5 GB
MongoDB:               ~500MB-1GB
Redis:                 ~100-200MB
n8n:                   ~300-500MB
Fastify API:           ~150-300MB
Next.js Dashboard:     ~200-400MB
Evolution API:         ~200-400MB (if dedicated)
Dokploy + Traefik:     ~300-500MB
OS overhead:           ~500MB
─────────────────────────────────
Total:                 ~4.5-6.5 GB minimum
Headroom for spikes:   ~2-4 GB
```

## Decisions

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
