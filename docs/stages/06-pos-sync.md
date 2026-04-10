# Stage 6: POS Legacy Sync

**Status**: `pending`
**Depends on**: Stage 1 (Odoo)
**Goal**: Service that reads inventory from external pharmacy POS systems (SQL Server/MySQL) and syncs to Odoo.

## Why

Many pharmacies already have a POS system managing their physical inventory. Instead of asking them to switch to Odoo for physical sales, we read their existing DB and keep Odoo in sync. Odoo remains the SSoT for the WhatsApp channel.

## Deliverables

- [ ] Sync service architecture defined
- [ ] SQL Server adapter (for POS systems using MSSQL)
- [ ] MySQL adapter (for POS systems using MySQL)
- [ ] Sync logic: map external products → Odoo products
- [ ] Lot and expiry date synchronization
- [ ] Stock quantity reconciliation
- [ ] Cron-based sync (configurable interval per store)
- [ ] Conflict handling: what if WhatsApp sold something the POS just sold?
- [ ] Logging and error reporting

## Approach

```
External POS DB (SQL Server / MySQL)
    ↓ (read-only, periodic poll)
Sync Service (Node.js)
    ↓ (JSON-RPC)
Odoo 17 (update stock, lots, expiry)
```

### Per-Vendor Adapters
Each POS vendor has a different schema. The sync service uses adapters:

```typescript
interface PosAdapter {
  connect(config: PosConfig): Promise<void>;
  getProducts(): Promise<PosProduct[]>;
  getStock(): Promise<PosStockEntry[]>;
  getLots(): Promise<PosLot[]>;
  disconnect(): Promise<void>;
}
```

### Sync Strategy
1. Poll external DB every N minutes (configurable)
2. Compare with last known state (stored in MongoDB)
3. Diff: new products, changed quantities, new lots
4. Apply changes to Odoo via JSON-RPC
5. Log sync results

### Stock Conflict Resolution
- Eventual consistency is accepted (there will be lag)
- On order fulfillment in dashboard, re-check Odoo stock
- If stock-out detected, notify customer via WhatsApp
- Dashboard shows "last synced at" timestamp per store

## Technical Notes

- SQL Server from Node.js: `tedious` or `mssql` package
- MySQL from Node.js: `mysql2` package
- Each pharmacy configures their POS connection in the dashboard (Settings)
- Connection strings stored encrypted in MongoDB

## Decisions

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
