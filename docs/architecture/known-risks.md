# Known Risks & Mitigations

Identified during architecture review. Track resolution status here.

## Critical

### 1. Concurrent n8n executions corrupt cart state
**Risk**: Two debounce windows fire for the same conversation while the first is still processing in n8n. Concurrent writes to cart/order state.
**Mitigation**: Per-conversation mutex in Redis (SETNX with 30s TTL). Queue subsequent triggers until current completes.
**Status**: `designed` — implemented in Stage 2

### 2. Duplicate orders from WhatsApp message retries
**Risk**: WhatsApp delivers at-least-once. A retried message can trigger duplicate Sale Orders in Odoo.
**Mitigation**: Idempotency key derived from Evolution message ID. Check Redis before processing.
**Status**: `designed` — implemented in Stage 2

### 3. VPS memory pressure
**Risk**: All services on one VPS. Under load, OOM kills are possible on <16GB.
**Mitigation**: Provision 16GB minimum. Set Docker memory limits per container. Monitor with alerts.
**Status**: `pending` — addressed in Stage 7

## High

### 4. Odoo XML-RPC/JSON-RPC latency during product search
**Risk**: Odoo queries can be slow (200-500ms+), causing long WhatsApp response times.
**Mitigation**: Redis product cache (TTL 5min). Send typing indicator immediately.
**Status**: `designed` — implemented in Stage 2

### 5. Bot reply sent after human handover
**Risk**: Human takes over chat, but n8n pipeline is already in flight. Bot reply arrives after handover.
**Mitigation**: Handover check at egress (before sending reply), not just at ingress.
**Status**: `designed` — implemented in Stage 2

### 6. n8n concurrency ceiling
**Risk**: n8n Community Edition has limited concurrent workflow executions. Under high load (20+ simultaneous conversations), it becomes a bottleneck.
**Mitigation**: Acceptable for 1-5 tenants with low-medium volume. If scaling beyond, move AI orchestration to microservice.
**Status**: `accepted` — revisit if scaling past 5 tenants

## Medium

### 7. POS sync lag causes phantom inventory
**Risk**: Customer orders a product via WhatsApp that was just sold at the physical counter. Inventory is stale.
**Mitigation**: Eventual consistency accepted. Re-check stock at fulfillment time. Notify customer of stock-out.
**Status**: `accepted` — by design

### 8. MongoDB working set exceeds RAM over time
**Risk**: Chat messages accumulate. If working set exceeds available RAM, query latency spikes.
**Mitigation**: TTL index on messages (90 days). Archive older data. Monitor collection sizes.
**Status**: `designed` — TTL in data model

### 9. Single point of failure (single VPS)
**Risk**: Any VPS-level failure takes down all services for all tenants.
**Mitigation**: Docker auto-restart policies. Daily backups. Accepted for MVP/early stage.
**Status**: `accepted` — revisit when revenue justifies multi-node

### 10. Evolution API session disconnects
**Risk**: WhatsApp sessions can disconnect requiring QR re-scan. Known Evolution API behavior.
**Mitigation**: Connection status monitoring. Dashboard alerts when a number disconnects.
**Status**: `pending` — addressed in Stage 5

### 11. Walk-in oversell while WhatsApp sells low-stock items
**Risk**: WhatsApp agent sells a product that the physical POS still thinks is in stock. The pharmacist, looking at their POS screen, then sells the same unit to a walk-in customer. Only one unit physically exists. Double-sell → customer complaint, refund, reputational damage.
**Why the original "accept eventual consistency" design is not enough**: Risk #7 only addresses the reverse direction (POS sold first, WhatsApp tries to sell). This one is the mirror image and requires active intervention, not just detection at fulfillment.
**Mitigation**: Tiered strategy based on stock level at time of WhatsApp sale (see ADR-007):
- **Stock < 5**: Human-in-the-loop. Agent tells customer "let me confirm availability", dashboard alerts pharmacist, sale holds until confirmed from physical shelf.
- **Stock 5-10**: Real-time push to POS immediately after Odoo commits the sale.
- **Stock > 10**: Nightly reconciliation job batch-pushes Odoo-origin sales to POS.
The nightly job also serves as safety net for failed real-time pushes.
**Requires**: POS adapter write capability (`pushSale`, `upsertStock`) in addition to read. Adds write-credential requirement to onboarding.
**Status**: `designed` — pending validation with first real customer, implemented in Stage 6
