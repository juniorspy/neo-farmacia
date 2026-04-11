# Stage 6: POS Legacy Sync

**Status**: `pending`
**Depends on**: Stage 1 (Odoo)
**Goal**: Bidirectional sync between external pharmacy POS systems (SQL Server/MySQL) and Odoo. Read inventory from POS. Write WhatsApp-originated sales back to POS using a tiered strategy (ADR-007).

## Why

Many pharmacies already have a POS system managing their physical inventory. Instead of asking them to switch to Odoo for physical sales, we read their existing DB and keep Odoo in sync. Odoo is the SSoT for the WhatsApp channel, but a WhatsApp sale must also be reflected in the physical POS so the pharmacist's walk-in customers don't buy the same unit twice.

## Deliverables

- [ ] Sync service architecture defined
- [ ] SQL Server adapter (read + write)
- [ ] MySQL adapter (read + write)
- [ ] Sync logic: map external products → Odoo products
- [ ] Lot and expiry date synchronization
- [ ] Stock quantity reconciliation
- [ ] Cron-based read sync (configurable interval per store)
- [ ] **Tiered write-back** (real-time for low-stock, batch for high-stock) — see ADR-007
- [ ] **Human-in-the-loop hold** for critical-low stock (< 5 units)
- [ ] **Nightly reconciliation job** — batch-push Odoo-origin sales, catch any real-time push failures
- [ ] Logging and error reporting

## Approach

### Read direction (POS → Odoo)
```
External POS DB (SQL Server / MySQL)
    ↓ (read-only, periodic poll)
Sync Service (Node.js)
    ↓ (JSON-RPC)
Odoo 17 (update stock, lots, expiry)
```

### Write direction (Odoo → POS) — tiered
```
Odoo sale.order.confirmed
    ↓
Sync Service — check stock level at sale time:
    ├── stock < 5   → HOLD: pharmacist must confirm from physical shelf
    ├── stock 5-10  → PUSH NOW: real-time write to POS via adapter.pushSale()
    └── stock > 10  → QUEUE: nightly batch job pushes + reconciles
```

### Per-Vendor Adapters
Each POS vendor has a different schema. The sync service uses adapters:

```typescript
interface PosAdapter {
  connect(config: PosConfig): Promise<void>;
  disconnect(): Promise<void>;

  // Read — POS → Odoo
  getProducts(): Promise<PosProduct[]>;
  getStock(): Promise<PosStockEntry[]>;
  getLots(): Promise<PosLot[]>;

  // Write — Odoo → POS (idempotent via sale_id key)
  pushSale(sale: PosSaleInput): Promise<PosPushAck>;
  upsertStock(productCode: string, qty: number): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

### Read Sync Strategy
1. Poll external DB every N minutes (configurable)
2. Compare with last known state (stored in MongoDB)
3. **Reconcile against in-flight sales**: incoming POS stock - pending write-back sales = Odoo stock. Prevents sync-forward from silently erasing recent Odoo sales that haven't been pushed back yet.
4. Diff: new products, changed quantities, new lots
5. Apply changes to Odoo via JSON-RPC
6. Log sync results

### Write Sync Strategy (tiered)

**Critical-low (< 5 units)**:
- Sale is created in Odoo as `draft` / pending-confirmation
- Pharmacist gets a dashboard alert: "WhatsApp wants to sell X — confirm from shelf"
- Customer receives a "checking availability" message via WhatsApp
- Only after pharmacist confirms, sale is marked confirmed AND pushed to POS immediately
- If pharmacist rejects (shelf empty), customer gets apology + alternatives

**Low (5 – 10 units)**:
- Sale is committed in Odoo immediately
- `adapter.pushSale()` is called synchronously after commit
- If push fails, sale is queued to retry queue with exponential backoff
- Dashboard badge on the order: "POS sync pending" / "POS sync failed"

**Normal (> 10 units)**:
- Sale is committed in Odoo, queued for batch processing
- Nightly reconciliation job (configurable time, default 2am local) runs per store:
  1. Fetch all Odoo-origin sales from today not yet pushed
  2. Call `adapter.pushSale()` for each with idempotency key
  3. Fetch final POS stock state
  4. Reconcile against Odoo, log any discrepancies for admin review
  5. Mark sales as synced

### Idempotency
Every `pushSale()` call includes `idempotency_key = store_id + sale_order_id`. POS adapters are expected to check this key and no-op if already seen. Prevents double-posting on retry or on nightly reconciliation of already-real-time-synced items.

### Failure Modes

| Failure | Handling |
|---|---|
| Real-time push fails | Retry with backoff (1s, 10s, 1m, 10m). After N retries, mark order as "POS sync failed" red badge. Night job will pick it up. |
| Nightly batch fails for a store | Admin alert. Store is flagged `sync_degraded`. WhatsApp agent continues normally but every order gets "POS sync pending" badge. |
| POS connection lost > 1 hour | WhatsApp sales automatically switch to critical-low tier (human-in-the-loop) regardless of stock until POS reconnects. Prevents flying blind. |
| POS pushSale returns conflict (already exists with different data) | Log, alert admin, do not retry automatically. |

### Onboarding: read-only vs read-write

Two supported signup modes:

**Option A — Full bidirectional (recommended)**
Pharmacy provides write-capable POS credentials. Full tiered strategy runs. Active status requires verified read + write health check.

**Option B — Read-only fallback**
Pharmacy provides read-only credentials. Sync is POS → Odoo only. Every dispatched WhatsApp order requires pharmacist to **manually re-enter in their POS** when picking from shelf. Dashboard shows reminder on each dispatch. Higher-friction operation for pharmacist, but lets pharmacies with inaccessible POS systems still onboard.

Store model field: `pos_sync_mode: 'bidirectional' | 'read_only'`. Decided at provisioning.

### Per-store configuration

Each store's POS config lives in Mongo `Store.pos_connector`:
```ts
pos_connector: {
  type: 'mssql' | 'mysql' | 'custom';
  mode: 'bidirectional' | 'read_only';
  config: { host, port, db, user, password };  // encrypted at rest
  read_interval_minutes: number;
  critical_stock_threshold: number; // default 5
  low_stock_threshold: number;      // default 10
  nightly_job_time: string;         // cron expression
  last_health_check_at: Date;
  last_sync_at: Date;
  sync_status: 'healthy' | 'degraded' | 'failed';
}
```

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
