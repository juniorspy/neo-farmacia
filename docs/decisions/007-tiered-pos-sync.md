# ADR-007: Tiered POS Sync-Back Strategy

**Date**: 2026-04-11
**Status**: designed (pending validation with first real customer)

## Context

Pharmacies run legacy POS systems that are the source of truth for physical inventory. The WhatsApp agent sells via Odoo, which means every WhatsApp sale creates a gap between Odoo's view of stock and the POS's view of stock.

ADR-004 established Odoo as SSoT for the WhatsApp channel. Stage 6 originally described sync as read-only (POS → Odoo, periodic poll) with "eventual consistency accepted" for one direction of conflict (POS sold first, WhatsApp tries to sell the same unit).

Known Risk #11 identified the mirror problem: **after a WhatsApp sale, the pharmacist's POS screen still shows the sold unit as available**. A walk-in customer can then buy the same physical unit the WhatsApp customer just bought. This risk is highest when stock is low (1–2 units) and negligible when stock is high (50+ units).

Fixing this requires some form of write-back from Odoo to the POS. The question is how aggressive.

## Options considered

### Option 1 — Read-only, manual double-entry
Pharmacist manually enters every dispatched WhatsApp order into their POS when picking from the shelf.
- **Pro**: Simplest. No write credentials needed. Matches the original Stage 6 design.
- **Con**: Double data entry is the opposite of what this platform promises. Error-prone. Adds friction to the exact workflow we're supposed to remove.

### Option 2 — Real-time push for every sale
Every WhatsApp sale immediately pushes to POS.
- **Pro**: Stock is always consistent. No walk-in oversell risk.
- **Con**: Expensive in I/O and latency for every sale. Every sale is blocked on POS availability. Requires full write adapters for every POS vendor from day one. Over-engineered for the 90% of sales where the item has plenty of stock.

### Option 3 — Nightly batch reconciliation only
Push all Odoo-origin sales to POS once a day.
- **Pro**: Cheap, simple, one batch job per store.
- **Con**: Walk-in oversell risk is unchecked for a full day per item. Critical-low stock (1-5 units) regularly becomes oversold because the whole day's worth of walk-ins happens before the batch runs.

### Option 4 — Tiered by stock level ✅
Different strategy per stock tier at time of sale:
- < 5 units: human-in-the-loop confirmation hold
- 5-10 units: real-time push
- &gt; 10 units: nightly batch reconciliation
- **Pro**: Cost is proportional to risk. Most sales pay zero sync cost. The sensitive minority gets real-time. The critical minority gets a human check, the only safe answer at that stock level.
- **Con**: More complex to implement. Three code paths instead of one. Thresholds need tuning per vendor/category (e.g. chronic-med pharmacy vs OTC).

## Decision

**Adopt Option 4 (tiered).** Thresholds are configurable per store with sensible defaults (5 and 10). The nightly job also functions as a safety net for failed real-time pushes in the mid tier.

## Thresholds and rationale

| Tier | Threshold | Behavior | Why |
|---|---|---|---|
| Critical | stock < 5 | Human-in-the-loop: pharmacist must confirm from shelf before sale commits | At <5 units, any walk-in arriving during the next few minutes can cause oversell. Only a human eyeball on the physical shelf is safe. |
| Low | 5 ≤ stock ≤ 10 | Real-time `pushSale()` immediately after Odoo commit | Stock low enough that a short delay matters. Cheap enough to do per sale. |
| Normal | stock > 10 | Queue for nightly reconciliation job | Walk-in oversell risk is negligible at high stock. Cheap batch processing is enough. |

Thresholds (`critical_stock_threshold`, `low_stock_threshold`) are per-store config. A pharmacy with chronic-medication focus (always high stock per SKU) might set (2, 5). A pharmacy with many rare items might set (10, 20).

## Idempotency

Every `pushSale()` call uses `idempotency_key = store_id + sale_order_id`. POS adapters check this key and no-op on duplicate. Safe to retry any failed push and safe for the nightly job to re-push items already synced real-time.

## Read-sync reconciliation

The read direction (POS → Odoo) must be aware of pending write-backs to avoid silently erasing WhatsApp sales that haven't been pushed yet:

```
odoo_stock = pos_stock - sum(pending_writebacks_for_this_product)
```

Without this, the read cycle would undo any write-back that hasn't yet been applied.

## Onboarding impact

Write access to each pharmacy's POS becomes a provisioning-time requirement. Two modes supported:

- **Bidirectional** (Option A in Stage 6): pharmacy grants write credentials. Full tiered strategy runs.
- **Read-only** (Option B in Stage 6): pharmacy can only grant read access. Fall back to manual double-entry. Agent sales show "POS sync required — enter in your POS" badge on every dispatch. Higher operational friction but unblocks pharmacies with locked-down POS systems.

Decided at signup. Store has `pos_connector.mode` field.

## Degraded operation

If POS connection is lost for > 1 hour, all WhatsApp sales for that store switch to critical-low tier regardless of stock (every sale becomes human-in-the-loop). Prevents flying blind. Resumes normal tier operation after POS reconnects and completes a health check.

## Consequences

- **Positive**: Correctness where it matters, cost where it doesn't. Pharmacist doesn't double-enter sales for the 90% case. Critical stock protected.
- **Positive**: Nightly batch is a natural safety net for failed real-time pushes.
- **Positive**: Admin alerting surface is narrow — only sync failures and reconciliation discrepancies.
- **Negative**: PosAdapter interface is larger (read + write + health). More work per vendor.
- **Negative**: Stock-tier decision happens at sale time, meaning Odoo needs to know product stock synchronously to pick a tier. Acceptable because the agent is already querying stock to make the sale.
- **Negative**: Thresholds are a knob that pharmacies will ask about. Needs clear documentation and sane defaults.

## Open questions

1. **Multi-line orders**: if one order has 3 line items, each at a different stock tier, which strategy wins? Current thinking: most restrictive tier wins (if any line is critical-low, the whole order holds for pharmacist confirmation).
2. **Concurrent sales racing on the same low-stock item**: if two WhatsApp conversations simultaneously try to buy the last 2 units (stock=4, both orders for 1 each, both see stock=4 before either commits), we can oversell within Odoo itself. Mitigation: **the critical-low tier solves this naturally for the dangerous case**. Any item at stock < 5 routes through pharmacist confirmation, which serializes commits — pharmacist confirms the first, Odoo decrements, the second order's confirmation screen reflects the lower stock (or shows "out of stock, confirm partial/reject"). For the mid tier (5-10) the race window still exists but is much narrower in practice (stock is higher, the two-customer race is rare). For the normal tier (>10) the race is negligible. **If it proves to be a real problem at the mid tier**, add a Redis product-level mutex during the brief commit window, scoped per-product-per-store.
3. **What if the POS rejects a real-time push** (e.g. integrity constraint, bad mapping)? Currently proposed: log, alert admin, do not retry, human resolves. Alternative: mark the Odoo sale as cancelled and refund. TBD — depends on how often this happens in practice.
4. **Threshold tuning with real data**: 5 and 10 are guesses. First customer will tell us.

## Revisit when

- First real customer is onboarded with a real POS — validate thresholds and the bidirectional mode with real write credentials
- First walk-in oversell incident (if any) — check whether it happened inside or outside our tiers' protected window
- POS vendor coverage reaches 3+ systems — evaluate whether any vendor is too locked down for bidirectional mode, forcing more pharmacies into read-only fallback
