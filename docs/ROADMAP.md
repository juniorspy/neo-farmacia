# Roadmap

## Stage Overview

| # | Stage | Status | Description |
|---|---|---|---|
| 1 | [Odoo](stages/01-odoo.md) | `done` | Inventory foundation — install, configure, validate JSON-RPC |
| 2 | [Microservice](stages/02-microservice.md) | `done` | Fastify API — webhook, debounce, Odoo proxy, handover |
| 3 | [Dashboard](stages/05-dashboard.md) | `done` | Web panel — API + Next.js frontend for pharmacy operations |
| 4 | [Multi-tenant Provisioning](stages/08-multi-tenant-provisioning.md) | `done — untested at scale` | Store model, one Odoo DB per pharmacy, scoped routing, super-admin UI, agent config |
| 5 | [n8n Agents](stages/03-n8n-agents.md) | `in_progress` (user-owned) | AI conversational logic — adapt 5 agents for pharmacy. User handles prompts; platform provides store_config payload. |
| 6 | [WhatsApp](stages/04-whatsapp.md) | `in_progress` | Evolution API — multi-connection model + reply sending implemented, webhook silent drop bug blocking e2e |
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

## Current Readiness Snapshot (2026-04-11, end of Phase B6)

**Working end-to-end, verified:**
- Provisioning pipeline (all 7 steps): tested via UI — `farmacia_geremy` created successfully with Odoo DB + Meilisearch index + dashboard admin in ~25s
- Default store adoption: existing `odoo` DB adopted as `store_leo` (Farmacia Leo) with 110 products
- DELETE endpoint with reverse cleanup + default-store safety
- Scoped routing: `orders`, `products`, `stats` endpoints route by `store_id` → correct Odoo DB
- Super-admin UI with live job progress + credential delivery panel + store switcher (2 stores active)
- Pharmacist login with provisioned credentials (JWT bug found and fixed)
- WhatsApp connection via dashboard QR flow (multi-connection model)
- n8n receives and processes payloads correctly (tested via direct curl)
- "Mi Agente" config page for pharmacy owners (form + live preview + cache invalidation)

**Built but blocked on open bugs** — see [testing-pending.md](status/testing-pending.md)

**Open bugs:**
1. **Webhook silent message drop** (Critical) — WhatsApp messages arrive at the API webhook but are silently dropped before reaching n8n. Debug logging added across the full pipeline. This is the #1 blocker for the WhatsApp→n8n→reply loop.
2. **Catalog sync auth for new pharmacies** (High) — `catalog-sync.service` uses `config.odoo.user` (global admin email) to auth against new pharmacy Odoo DBs where that user doesn't exist. Affects `farmacia_geremy`.

**Known blockers before first real customer:**
1. **Fix webhook silent drop** — diagnose with existing debug logging, fix the pipeline. Blocks all WhatsApp functionality.
2. **Fix catalog sync auth** — use store-specific credentials or master admin for scoped Odoo client.
3. **Evolution reply sending** — code written (Phase B6), needs e2e test once webhook drop is fixed.
4. **n8n flows adapted for pharmacy** — user-owned, in progress.
5. **POS connector for first target pharmacy** — blocked on first customer decision. See ADR-007.

## Progress Tracking

Each stage file in `docs/stages/` contains:
- Objectives and deliverables
- Checklist of tasks
- Technical decisions made
- Current blockers
- Links to relevant code

Update the status in this table as stages progress: `pending` → `in_progress` → `done`
