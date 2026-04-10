# Roadmap

## Stage Overview

| # | Stage | Status | Description |
|---|---|---|---|
| 1 | [Odoo](stages/01-odoo.md) | `done` | Inventory foundation — install, configure, validate JSON-RPC |
| 2 | [Microservice](stages/02-microservice.md) | `done` | Fastify API — webhook, debounce, Odoo proxy, handover |
| 3 | [Dashboard](stages/05-dashboard.md) | `in_progress` | Web panel — API + Next.js frontend for pharmacy operations |
| 4 | [n8n Agents](stages/03-n8n-agents.md) | `pending` | AI conversational logic — adapt 5 agents for pharmacy |
| 5 | [WhatsApp](stages/04-whatsapp.md) | `pending` | Evolution API — connect numbers, test end-to-end flow |
| 6 | [POS Sync](stages/06-pos-sync.md) | `pending` | Legacy POS integration — SQL Server/MySQL → Odoo |
| 7 | [Production](stages/07-production.md) | `pending` | Docker compose, health checks, monitoring, alerts |

## Dependency Graph

```
[1. Odoo] ──→ [2. Microservice] ──→ [3. Dashboard]
                                        │
                                  [4. n8n Agents] ──→ [5. WhatsApp]
                                        │
                                  [6. POS Sync] (independent, needs Odoo)
                                        │
                                  [7. Production] (after all stages work)
```

## Progress Tracking

Each stage file in `docs/stages/` contains:
- Objectives and deliverables
- Checklist of tasks
- Technical decisions made
- Current blockers
- Links to relevant code

Update the status in this table as stages progress: `pending` → `in_progress` → `done`
