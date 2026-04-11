# Stage 8: Multi-Tenant Provisioning

**Status**: `done — untested at scale`
**Depends on**: Stage 2 (Microservice), Stage 3 (Dashboard)
**Goal**: Onboard new pharmacies through an assisted-signup pipeline that creates an isolated Odoo database per pharmacy, a dedicated Meilisearch index, a dashboard login, and agent config — all transactional, idempotent, and observable.

Implemented on 2026-04-11. See session log [2026-04-11-01](../sessions/2026-04-11-01.md).

## Why

ADR-004 makes Odoo the single source of truth. ADR-007 makes the sync-back tiered per pharmacy. Neither works without strong tenant isolation. We chose **one Odoo database per pharmacy** (over multi-company-in-one-DB) because pharmacies are regulated, their inventories are not shared, and a cross-tenant leak is a legal problem, not a bug. Dokploy + Odoo's multi-DB mode supports this natively.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Super-admin creates pharmacy via dashboard or curl    │
│                         ↓                              │
│          POST /api/v1/admin/pharmacies                 │
│                         ↓                              │
│     createPharmacy() in provisioning.service.ts        │
│      - slugify name → store_id                         │
│      - generate random admin password                  │
│      - create Store doc (status=pending)               │
│      - create ProvisioningJob doc (7 steps pending)    │
│      - return 201 immediately                          │
│                         ↓                              │
│      Background worker (interval 5s) advances the job  │
│      one step at a time with atomic claim via Mongo    │
│      findOneAndUpdate. Each step is idempotent.        │
└─────────────────────────────────────────────────────────┘
```

## The 7 provisioning steps

| # | Step | What it does | Idempotency strategy |
|---|---|---|---|
| 1 | `mongo_store` | Marks the Store doc `provisioning` | Checks for doc existence |
| 2 | `odoo_db_create` | Calls `db.create_database` via master password, creates `pharmacy_<slug>` | Existence check + **authenticated health probe**; drops and recreates if DB exists but auth fails |
| 3 | `odoo_seed_admin` | Renames res.users and res.company to match pharmacy, sets tz/lang | Safe to re-run |
| 4 | `create_dashboard_admin` | Creates an `Admin` doc in Mongo with `role: 'pharmacist'`, same random password bcrypt-hashed | If email already exists, appends the store to their existing stores list |
| 5 | `meilisearch_index` | Ensures `store_<store_id>_products` index | Meilisearch PUT is idempotent |
| 6 | `agent_config` | Seeds default agent name/greeting on Store doc | Checks for existing agent_name |
| 7 | `email_credentials` | Stub: logs plaintext credentials and retains them in step data for super-admin retrieval until `mark-delivered` scrubs | Always safe to re-run |

Total wall time on the test run: **~25 seconds** (odoo_db_create is 22s, the rest are sub-second).

## Store model (MongoDB)

```ts
interface IStore {
  store_id: string;              // e.g. "store_leo", "farmacia_carol"
  name: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  timezone: string;              // default 'America/Santo_Domingo'
  currency: string;              // default 'DOP'
  country_code: string;          // default 'DO'
  lang: string;                  // default 'es_DO'
  odoo_db: string;               // name of the tenant's Odoo database
  meilisearch_index: string;     // store_<store_id>_products
  agent_config: {
    agent_name: string;
    greeting_style: 'formal' | 'casual' | 'amigable';
    signature: string;
    business_hours: string;
    delivery_info: string;
    custom_notes: string;        // max 500 chars, free-form extras
  };
  whatsapp_instance_id: string | null;
  odoo_admin_password_hash: string | null;  // bcrypt hash, reference only
  status: 'pending' | 'provisioning' | 'active' | 'failed' | 'suspended';
}
```

## ProvisioningJob model (MongoDB)

State machine with atomic claim (`findOneAndUpdate` with stale-lock cutoff 5 min), per-step status, and explicit error capture.

```ts
interface IProvisioningJob {
  store_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: IStepState[];
  current_step_index: number;
  attempt: number;
  last_error: string | null;
  locked_at: Date | null;
}
```

## Scoped Odoo routing

The legacy `shared/odoo.ts` was kept as-is (still used by a few non-HTTP callers) and a new parallel API was added:

- `shared/odoo-scoped.ts` — `ScopedOdoo` class, `odooDbCreate/odooDbDrop/odooDbExists/odooDbList`
- `shared/odoo-scoped-cache.ts` — process-level cache of `ScopedOdoo` clients keyed by `(url, db, user)`. Avoids re-auth on every request.
- `shared/odoo-store-ops.ts` — scoped versions of the helpers (`listSaleOrdersScoped`, `createSaleOrderScoped`, etc.) that take a `ScopedOdoo` as first arg.
- `modules/store-context/store-context.plugin.ts` — Fastify preHandler `resolveStore` that:
  1. Reads `storeId` from URL param / query / header / JWT
  2. Loads the Store from Mongo (rejects 404 / 409 / 403 appropriately)
  3. Attaches `request.store` + cached `request.odoo` for downstream handlers

**Refactored to use scoped routing** (Phase B1–B2):
- `orders`, `products`, `stats`, `catalog-sync` routes → `request.odoo`
- `commands.routes` → resolves store + scoped client before dispatching command handlers
- `pedido.handler` → uses `ctx.odoo` instead of the global singleton

**Still using the legacy default-DB path** (intentional — low priority):
- `odoo/odoo.routes.ts` — raw Odoo passthrough endpoints. Marked for refactor when actually used.

## Seed: adopting the existing `odoo` DB as Farmacia Leo

`seedDefaultStore()` runs on API startup and is idempotent. On first boot it creates a `Store` doc with:
- `store_id: 'store_leo'`
- `name: 'Farmacia Leo'`
- `odoo_db: config.odoo.db` (= existing `odoo` database with 110 products)
- `status: 'active'`

This turns the pre-provisioning deployment into a legitimate first tenant without re-creating the DB.

## Super-admin UI

Route: `/admin/pharmacies` (sidebar section "Administración" visible only for `role=admin`).

Features:
- List table with status badges (`active`, `provisioning`, `pending`, `failed`, `suspended`)
- Auto-refresh every 3s while any pharmacy is provisioning
- "Nueva farmacia" modal — name, owner name, email, phone
- Details drawer with step-by-step job progress, per-step duration, error messages
- **Credentials panel** for pharmacies where plaintext password is still retained: copy-to-clipboard for URL/email/password + "Marcar como entregadas" scrub button
- Retry button for failed jobs
- Delete button (hidden for `store_leo`)

## Delete flow

`DELETE /api/v1/admin/pharmacies/:storeId?confirm=yes`:

1. Refuses `store_leo` (default store, holds shared `odoo` DB)
2. Requires explicit `?confirm=yes` query param
3. Reverse-order cleanup:
   - `deleteIndex(store.meilisearch_index)` — Meilisearch (idempotent)
   - `odooDbDrop(...)` — Odoo DB (idempotent, skips if already gone)
   - `ProvisioningJob.deleteMany({store_id})`
   - `Store.deleteOne({store_id})`
4. Each sub-step logs its own warnings but does not abort cleanup on partial errors

## Store switcher for super-admin

When a user with `role=admin` logs in, the dashboard's `Shell` component fetches `/api/v1/admin/pharmacies` and feeds the active pharmacies into the existing store switcher in the header. This lets the super-admin view any tenant's orders/products/chats/etc. by picking from the dropdown — no impersonation endpoint needed, just a different `store_id` in the URL that the already-refactored routes respect.

## Configuration

New env vars on the `api` service:

```
ODOO_MASTER_PASSWORD=<same value as pos service's admin_passwd>
ODOO_DEFAULT_ADMIN_PASSWORD=<unused, kept as fallback>
ODOO_DEFAULT_COUNTRY_CODE=DO
ODOO_DEFAULT_LANG=es_DO
```

On the `pos` service, Odoo's `admin_passwd` is set via an entrypoint shell script that writes `admin_passwd = ${ODOO_ADMIN_PASSWD}` into `/etc/odoo/odoo.conf` before exec-ing Odoo. The shell wrapper was needed because Odoo 17 has no `--admin-passwd` CLI flag; the setting exists only in config.

## Security posture

- **Master password** is a strong random value, stored only in Dokploy env (`pos` service `ODOO_ADMIN_PASSWD`, `api` service `ODOO_MASTER_PASSWORD`), never in git
- **Per-pharmacy admin passwords** are randomly generated per provisioning (24-char base64url), bcrypt-hashed on the Store record, plaintext only in the provisioning job's email step data until a super-admin marks them delivered
- **`/web/database/manager` is still publicly reachable** but protected by the strong master password. Hardening via Traefik middleware is a known follow-up.
- **JWT payload includes user stores** and the `resolveStore` middleware enforces that `role=pharmacist` users can only access stores in their `stores[]`

## Known gaps

- **Evolution API reply sending** — the webhook logs `'Bot reply ready'` but doesn't actually POST to Evolution (needs per-store instance apiKey wired into the Store model)
- **WhatsApp instance binding in UI** — the existing WhatsApp page creates instances in Evolution but doesn't update `Store.whatsapp_instance_id`, so `resolveStoreByInstance` can't find them yet
- **Email stub** — credentials are logged + retained in step data. No real SMTP/transactional send yet.
- **No resend-credentials flow** — clicking "mark delivered" permanently scrubs the plaintext. Recovery requires manual Odoo UI password reset.
- **Product-level atomic mutex at commit time** — the critical-low tier (<5 units) from ADR-007 serializes via pharmacist confirmation, but the 5-10 tier still has a narrow race window that's deferred.

## Files changed (this stage)

Key modules:
- `packages/api/src/modules/provisioning/` — 11 files (models, service, worker, routes, 7 step implementations)
- `packages/api/src/shared/odoo-scoped.ts`, `odoo-scoped-cache.ts`, `odoo-store-ops.ts`
- `packages/api/src/modules/store-context/store-context.plugin.ts`
- `packages/api/src/modules/stores/stores.routes.ts`
- `packages/api/src/modules/webhook/store-resolver.ts`
- `packages/dashboard/src/app/(dashboard)/admin/pharmacies/page.tsx`
- `packages/dashboard/src/app/(dashboard)/agent/page.tsx`

Refactored for scoped routing:
- `packages/api/src/modules/orders/orders.routes.ts`
- `packages/api/src/modules/products/products.routes.ts`
- `packages/api/src/modules/stats/stats.routes.ts`
- `packages/api/src/modules/catalog-sync/*`
- `packages/api/src/modules/commands/commands.routes.ts`
- `packages/api/src/modules/commands/handlers/pedido.handler.ts`
- `packages/api/src/modules/webhook/webhook.handler.ts`

## Session References

- [2026-04-11-01](../sessions/2026-04-11-01.md) — full day of building provisioning + scoped routing + Phase B wiring
