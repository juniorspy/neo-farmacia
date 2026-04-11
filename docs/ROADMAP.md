# Roadmap

## Stage Overview

| # | Stage | Status | Description |
|---|---|---|---|
| 1 | [Odoo](stages/01-odoo.md) | `done` | Inventory foundation — install, configure, validate JSON-RPC |
| 2 | [Microservice](stages/02-microservice.md) | `done` | Fastify API — webhook, debounce, Odoo proxy, handover |
| 3 | [Dashboard](stages/05-dashboard.md) | `done` | Web panel — API + Next.js frontend for pharmacy operations |
| 4 | [Multi-tenant Provisioning](stages/08-multi-tenant-provisioning.md) | `done — untested at scale` | Store model, one Odoo DB per pharmacy, scoped routing, super-admin UI, agent config |
| 5 | [n8n Agents](stages/03-n8n-agents.md) | `in_progress` (user-owned) | AI conversational logic — adapt 5 agents for pharmacy. User handles prompts; platform provides store_config payload. |
| 6 | [WhatsApp](stages/04-whatsapp.md) | `in_progress` | Evolution API — instance→store mapping done, binding from UI + reply sending pending |
| 7 | [POS Sync](stages/06-pos-sync.md) | `designed` | Tiered write-back (ADR-007). SQL Server/MySQL adapters pending. |
| 8 | [Production](stages/07-production.md) | `pending` | Backups, monitoring, alerts, rate limiting, Traefik hardening |

## Dependency Graph

```
[1. Odoo] ──→ [2. Microservice] ──→ [3. Dashboard]
                      │                    │
                      └──→ [4. Multi-tenant Provisioning]
                                  │
                      ┌───────────┼───────────┐
                      ↓           ↓           ↓
               [5. n8n Agents] [6. WhatsApp] [7. POS Sync]
                      └─────┬─────┘           │
                            ↓                 │
                        first real   ←────────┘
                         pharmacy
                            │
                            ↓
                     [8. Production]
```

## Current Readiness Snapshot (2026-04-11)

**Working end-to-end, verified:**
- Provisioning pipeline: `POST /api/v1/admin/pharmacies` → new isolated Odoo DB + Meilisearch index + admin in ~25 seconds
- Default store adoption: existing `odoo` DB adopted as `store_leo` (Farmacia Leo) with 110 products
- DELETE endpoint with reverse cleanup + default-store safety
- Scoped routing: `orders`, `products`, `stats` endpoints route by `store_id` → correct Odoo DB
- Super-admin UI with live job progress + credential delivery panel + store switcher
- `catalog-sync` iterates all active stores each tick (replaced hardcoded single-store)
- n8n command handler (`pedido.handler`) resolves store from the command context
- Webhook resolves store from Evolution instance name and injects `store_config` into the n8n payload
- "Mi Agente" config page for pharmacy owners (form + live preview + cache invalidation)

**Built but untested in a real flow** — see [testing-pending.md](status/testing-pending.md)

**Known blockers before first real customer:**
1. **Evolution reply sending** — webhook logs "bot reply ready" but doesn't actually POST to Evolution API (needs per-store instance apiKey). ~30 min.
2. **WhatsApp page store binding** — creating an Evolution instance from the dashboard doesn't yet update `Store.whatsapp_instance_id`. ~20 min.
3. **n8n flows adapted for pharmacy** — user-owned, in progress.
4. **POS connector for first target pharmacy** — blocked on first customer decision. See ADR-007.

## Progress Tracking

Each stage file in `docs/stages/` contains:
- Objectives and deliverables
- Checklist of tasks
- Technical decisions made
- Current blockers
- Links to relevant code

Update the status in this table as stages progress: `pending` → `in_progress` → `done`
