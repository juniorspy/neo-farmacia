# Roadmap

## Stage Overview

| # | Stage | Status | Description |
|---|---|---|---|
| 1 | [Odoo](stages/01-odoo.md) | `done` | Inventory foundation — install, configure, validate JSON-RPC |
| 2 | [Microservice](stages/02-microservice.md) | `pending` | Fastify API — webhook, debounce, Odoo proxy, handover |
| 3 | [n8n Agents](stages/03-n8n-agents.md) | `pending` | AI conversational logic — adapt 5 agents for pharmacy |
| 4 | [WhatsApp](stages/04-whatsapp.md) | `pending` | Evolution API — connect numbers, test end-to-end flow |
| 5 | [Dashboard](stages/05-dashboard.md) | `pending` | Web panel — API + Next.js frontend for pharmacy operations |
| 6 | [POS Sync](stages/06-pos-sync.md) | `pending` | Legacy POS integration — SQL Server/MySQL → Odoo |
| 7 | [Production](stages/07-production.md) | `pending` | Docker compose, health checks, monitoring, alerts |

## Dependency Graph

```
[1. Odoo] ──→ [2. Microservice] ──→ [3. n8n Agents] ──→ [4. WhatsApp]
                     │                                         │
                     └──→ [5. Dashboard] ◄─────────────────────┘
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
