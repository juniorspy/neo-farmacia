# Roadmap

## Stage Overview

| # | Stage | Status | Description |
|---|---|---|---|
| 1 | [Odoo](stages/01-odoo.md) | `done` | Inventory foundation — install, configure, validate JSON-RPC |
| 2 | [Microservice](stages/02-microservice.md) | `done` | Fastify API — webhook, debounce, Odoo proxy, handover |
| 3 | [Dashboard](stages/05-dashboard.md) | `done` | Web panel — API + Next.js frontend for pharmacy operations |
| 4 | [Multi-tenant Provisioning](stages/08-multi-tenant-provisioning.md) | `done — untested at scale` | Store model, one Odoo DB per pharmacy, scoped routing, super-admin UI, agent config |
| 5 | [n8n Agents](stages/03-n8n-agents.md) | `in_progress` (user-owned) | AI conversational logic — adapt 5 agents for pharmacy. User handles prompts; platform provides store_config payload. |
| 6 | [WhatsApp](stages/04-whatsapp.md) | `in_progress` — **silent-drop bug FIXED** (debounce TTL); reply loop pending final e2e verification | Evolution API — multi-connection, reply sending, webhook pipeline |
| 7 | [POS Sync](stages/06-pos-sync.md) | `designed` | Tiered write-back (ADR-007). SQL Server/MySQL adapters pending. |
| 8 | [Production](stages/07-production.md) | `pending` | Backups, monitoring, alerts, rate limiting, Traefik hardening |
| 9 | [Voice Calls](stages/09-voice-calls.md) | `in_progress` — v3 LiveKit pipeline; session/link/create/config/transport **built**; pending LiveKit creds + real context + n8n trigger | AI-initiated WebRTC voice calls with per-pharmacy voice config |

## Dependency Graph

```
[1. Odoo] ──→ [2. Microservice] ──→ [3. Dashboard]
                      │                    │
                      └──→ [4. Multi-tenant Provisioning]
                                  │
                      ┌───────────┼───────────┬───────────┐
                      ↓           ↓           ↓           ↓
               [5. n8n Agents] [6. WhatsApp] [7. POS Sync] [9. Voice Calls]
                      └─────┬─────┘           │
                            ↓                 │
                        first real   ←────────┘
                         pharmacy
                            │
                            ↓
                     [8. Production]
```

## Current Readiness Snapshot (2026-06-03)

**Fixed since the 2026-04-11 snapshot** (see docs/sessions/2026-06-03-01.md):

1. **Webhook silent message drop — ROOT-CAUSED AND FIXED** (`72ee0f6`). The debounce
   Redis key was set with TTL = `windowMs` but the check ran at `windowMs + 100` —
   the key always expired mid-wait, so EVERY message was dropped before n8n. The #1
   blocker is gone. The full WhatsApp → n8n → reply loop still needs a final e2e pass.
2. **CORS blocked DELETE/PATCH** (`36453d3`). `@fastify/cors` defaults to
   `GET,HEAD,POST` — the WhatsApp disconnect (DELETE) and agent-config save (PATCH)
   were silently blocked at the browser preflight. Methods now explicit.
3. **Cross-tenant leak closed** (`ab0c5c0`): `chats` and `customers` routes were
   missing the `resolveStore` guard — any logged-in user could read another store's
   data by changing the URL.
4. **`extractText` hardened**: ephemeral/viewOnce/edited envelopes + media captions +
   button/list replies now extract correctly (was a silent-drop source for those types).
5. **Dashboard hardening** (`57bdd9e`, `be0df4f`): api client tolerates empty/204
   bodies and surfaces real backend errors; hardcoded `store_leo` fallback removed
   from all pages (fetches now gate on the resolved store).

**Voice Calls (Stage 9) — new since April:**

- Plan co-reviewed adversarially with Codex (v2), then pivoted to the proven
  **LiveKit pipeline** from neo_colmado (v3) with all v2 robustness kept.
- **Built and pushed** (`0adcd16`, `6c446a5`, `41dafe3`):
  - `voice_call_sessions` (atomic state machine, one-time signed links, compound
    idempotency, one-active-per-chat lock, missed-ring sweep)
  - `POST /api/v1/voice-calls` for n8n (bearer, chat∈store validation) → signed link
  - Public `/call/:id` page (ring/answer/reject + LiveKit room join)
  - **Per-pharmacy `voice_config`** edited in the super-admin (with "apply to all"),
    LLM/TTS providers as toggles (openai|anthropic / openai|elevenlabs|cartesia|google)
  - `GET /:id/token` mints a scoped LiveKit room token (metadata = context + voice_config)
  - **`packages/voice-agent/`** — Python LiveKit worker, builds STT/LLM/TTS per call
    from `voice_config`; v1 policy read-only (single `catalogo.search` tool, no order
    mutations, no clinical advice)
- **Pending**: LiveKit Cloud project creds + Dokploy `voice-agent` service env (user),
  Phase E (real context assembler: Mongo messages + Odoo order → metadata), Phase F
  (n8n decides + sends the link), Phase G (hardening, transcripts, human takeover).

**Open bugs:**

1. **Catalog sync auth for new pharmacies** (High) — `catalog-sync.service` authenticates
   against new pharmacy Odoo DBs with the global admin user, which doesn't exist there.
   Affects `farmacia_geremy`. Products of new pharmacies don't get indexed.
2. **`disponibleVentas` always true** (Medium) — `catalogo.handler.ts` has `|| true`
   leftover; the bot reports every product as available. Pending a product decision on
   the inventory-connection strategy (connector for legacy POS vs API) before flipping.

**Known blockers before first real customer:**

1. Final e2e verification of WhatsApp → n8n → reply loop (post debounce fix).
2. Catalog sync auth fix (any pharmacy other than Leo has an empty search index).
3. n8n flows adapted for pharmacy — user-owned, in progress.
4. POS connector for first target pharmacy — blocked on first-customer decision (ADR-007).

## Progress Tracking

Each stage file in `docs/stages/` contains objectives, checklists, decisions, blockers,
and links to code. Update the status in this table as stages progress:
`pending` → `in_progress` → `done`.
