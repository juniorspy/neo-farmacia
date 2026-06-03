# Testing Pending

Components and flows that are **built and typechecked but have not been exercised end-to-end**. This is the highest-priority list before onboarding a real customer — every item here is a place where a surprise can land.

Updated: 2026-06-03 (post bug-fix + voice-calls session — see sessions/2026-06-03-01.md)

Legend:
- 🟢 **Verified** — actually invoked against real infrastructure and observed to work
- 🟡 **Partial** — some paths verified, others not
- 🔴 **Untested** — never exercised in a real call / UI flow

---

## Provisioning pipeline

| Flow | Status | Notes |
|---|---|---|
| `POST /api/v1/admin/pharmacies` → 7 steps → active | 🟢 | **Verified via UI**: created `farmacia_geremy` from admin dashboard. All 7 steps completed successfully in ~25s. |
| `create_dashboard_admin` step | 🟢 | Verified as part of `farmacia_geremy` provisioning. Admin doc created in Mongo with `role=pharmacist`. Login works (after JWT bug fix). |
| Partial-failure recovery (unhealthy Odoo DB) | 🔴 | The `verifyDbHealthy` + drop-and-recreate path in `odoo-db-create.step.ts` was added but hasn't been triggered. Needs artificial failure: e.g. manually corrupt a DB mid-create and verify the retry path cleans up. |
| `POST /admin/pharmacies/:id/retry` | 🔴 | Endpoint exists but was never called. Failure injection needed. |
| `DELETE /admin/pharmacies/:id?confirm=yes` | 🟢 | Verified against `farmacia_test`: dropped Meilisearch index + Odoo DB + Mongo records. Also verified: missing `confirm` → 400, targeting `store_leo` → refused. |
| `POST /admin/pharmacies/:id/credentials/mark-delivered` | 🔴 | Endpoint exists, scrub logic written. Never invoked. |
| Stale lock reclaim (worker crash mid-step) | 🔴 | 5-minute stale-lock cutoff in `runNextJobStep` is in the code path but has never been triggered. Needs injected crash. |

## Scoped Odoo routing

| Flow | Status | Notes |
|---|---|---|
| `resolveStore` middleware — happy path | 🟢 | Verified: `/api/v1/stores/store_leo/products` returns real data, `/store_ghost/...` returns 404. |
| `resolveStore` — non-admin user accessing store not in their list | 🔴 | Access-control path written (`if role != admin && !stores.includes(id)`). Never triggered — only the super-admin account exists today. |
| `resolveStore` — suspended/failed store | 🔴 | 409 response path written. Never triggered. |
| `orders.routes` scoped queries | 🟢 | Verified returning real Odoo data through the scoped client. |
| `products.routes` scoped queries | 🟢 | Same. |
| `stats.routes` scoped queries | 🟡 | The two summary endpoints were verified implicitly when loading the dashboard home. The charts endpoint is theoretically scoped but hasn't been smoke-tested since the refactor. |
| `chats.routes` | 🔴 | Reads from MongoDB with `store_id` filter (was already store-aware). Not retested after middleware introduction. |
| `customers.routes` | 🔴 | Same as chats. |
| `catalog-sync` periodic iteration across multiple active stores | 🔴 | Now two active stores exist. Sync works for `store_leo` but **fails for `farmacia_geremy`** — scoped Odoo auth uses `config.odoo.user` (global admin email) instead of store-specific credentials. Open bug. |
| `catalog-sync` routes (`POST /resync`, `PATCH /synonyms`) | 🔴 | Refactored to use `request.store` + `request.odoo`. Never called post-refactor. |
| `ScopedOdoo` cache correctness | 🔴 | Cached clients per `(url, db, user)`. Multi-store requests have never happened concurrently. |

## Command dispatch (n8n → api)

| Flow | Status | Notes |
|---|---|---|
| `POST /api/v1/commands` — store resolution in router | 🔴 | Store lookup + scoped client attachment added. Since n8n flows haven't been invoked post-refactor, this path has run zero times. |
| `pedido.updateItems` via scoped `ctx.odoo` | 🔴 | Full rewrite of the handler. No n8n call has gone through it since the refactor. |
| `pedido.consultarPrecio` scoped | 🔴 | Same. |
| `pedido.despachar` scoped | 🔴 | Same. |
| `pedido.cancel` scoped | 🔴 | Same. |
| `catalogo.search` (Meilisearch) | 🟡 | Was already store-aware. Functional in the previous setup, but cross-pharmacy isolation (two stores with different catalogs) has never been observed. |
| `usuario.lookupCombined` / `usuario.ensure` | 🟡 | Same as catalogo — already store-aware via Mongo filter, but never exercised with two real tenants. |
| Idempotency (`command_id` replay) | 🔴 | Not retested since the refactor. |

## Webhook + Evolution

| Flow | Status | Notes |
|---|---|---|
| `resolveStoreByInstance` lookup from Evolution instance name | 🟡 | Store resolver is invoked when WhatsApp messages arrive (tested with `farmacia_geremy`'s connected instance). Messages reach the API webhook endpoint, but are **silently dropped** before reaching n8n. Debug logging added — diagnosis pending. |
| Store-resolver in-memory cache + 60s TTL | 🟡 | Cache is active during webhook processing. Not independently verified for correctness. |
| `invalidateStoreResolverCache` on agent-config save | 🔴 | Call site exists in `stores.routes.ts`. Never triggered. |
| `store_config` injection in n8n payload | 🔴 | Blocked by the silent message drop bug — messages never get far enough to inject store_config. |
| Debounce + mutex + handover + idempotency pipeline | 🔴 | **Active bug**: messages are silently dropped somewhere in this pipeline. Debug logging added across all stages. The exact failure point has not been identified yet. |
| Bot reply actually sent to customer via Evolution | 🔴 | **Code written** (Phase B6) — `sendText` via Evolution API using the store's connection `instanceName`. Untested end-to-end because blocked by the webhook silent drop bug. |
| n8n receiving payloads (direct curl) | 🟢 | Tested by sending a payload directly to the n8n webhook URL. n8n processes correctly. |
| n8n responding with reply text | 🟢 | Confirmed n8n returns valid reply text when given a well-formed payload. |

## Dashboard UI

| Page / flow | Status | Notes |
|---|---|---|
| Super-admin pharmacies list page | 🟢 | Used to create `farmacia_geremy` in Phase B6. List, create modal, and details drawer all exercised. |
| Create pharmacy modal → form submit → auto-refresh | 🟢 | Used to create `farmacia_geremy`. Submit → 201 → auto-refresh showed 7-step progression. |
| Job progress steps in details drawer | 🟢 | Observed full 7-step progression for `farmacia_geremy` including `create_dashboard_admin`. |
| Credentials copy-to-clipboard panel | 🔴 | Needs a pharmacy whose `email_credentials` step has `admin_password` still in data. Will appear on the first new-pharmacy creation after deploy. |
| Mark-delivered button flow | 🔴 | Relies on the above. |
| Retry button on failed jobs | 🔴 | Needs an injected failure. |
| Delete button → confirm dialog → API call | 🔴 | Logic is there, never clicked. |
| Super-admin store switcher in header | 🟢 | Now 2 active stores (Farmacia Leo + farmacia_geremy). Dropdown appears and switching works. |
| `/agent` "Mi Agente" config page | 🔴 | Loads, form renders, save PATCHes. Never saved. Live preview logic never rendered with user input. |
| Agent config — greeting-style radio buttons | 🔴 | |
| Agent config — character count on `custom_notes` | 🔴 | |

## Session tooling

| Flow | Status | Notes |
|---|---|---|
| Pharmacist login with credentials from a newly provisioned pharmacy | 🟡 | **Tested**: logged in as `farmacia_geremy` pharmacist. Initially got 403 — JWT `stores` field contained ObjectIds instead of `store_id` strings. Bug found and fixed (commit `e5f0749`). Login works after fix. Needs retest to confirm the fix is clean. |
| Pharmacist tries to access another store's data | 🔴 | Should get 403 from `resolveStore`. Never triggered. |

## Suggested smoke test (single path that exercises most of the above)

After the next `api` + `dashboard` deploy:

1. **Log in as super-admin** at `app.leofarmacia.com` → Administración → Farmacias
2. **Click "Nueva farmacia"**, create `Farmacia Prueba` with `prueba@test.com` as owner
3. **Watch the details drawer** for the 7-step progression, including the new `create_dashboard_admin` step. Total should be ~25-30 seconds.
4. **Verify the credentials panel** shows password, URL, email. Copy the password.
5. **Verify the store switcher** in the header now shows two stores (Farmacia Leo + Farmacia Prueba).
6. **Switch to Farmacia Prueba** in the dropdown. Orders and Products pages should be **empty**.
7. **Switch back to Farmacia Leo** — real data should reappear.
8. **Navigate to "Mi Agente"** page. Change the agent name to something like `Luisa`. Save. Green "Guardado" flash.
9. **Log out**, log in with `prueba@test.com` + the copied password.
10. **Verify** you see only Farmacia Prueba, the Mi Agente page shows `Luisa`, and trying to hit `https://app.leofarmacia.com/orders` (which defaults to `store_leo` if no switcher selection) either 403s at the API level or stays on Farmacia Prueba.
11. **Go back as super-admin**, open the details drawer for Farmacia Prueba, click "Marcar como entregadas". Verify panel flips to green "Credenciales entregadas".
12. **Click Eliminar** on Farmacia Prueba. Confirm. Verify it disappears from the list.

This one path touches: provisioning pipeline (all 7 steps), scoped routing, store switcher, My Agent config, pharmacist login, access control, and delete flow. ~10 minutes of manual work, covers roughly 80% of the 🔴 rows above.

## Things that cannot be tested from the dashboard alone

These require n8n + WhatsApp in the loop:

- ~~Real webhook arriving with a valid Evolution instance name~~ — **works**
- ~~`resolveStoreByInstance` returning a real Store~~ — **works** (farmacia_geremy's instance resolves)
- ~~Silent message drop before n8n~~ — **FIXED 2026-06-03** (debounce key TTL expired before its own check; `72ee0f6`)
- `store_config` payload actually consumed by n8n agents — **unblocked**, pending e2e run
- End-to-end order creation from a WhatsApp message — **unblocked**, pending e2e run
- Reply back to the customer via Evolution — **unblocked** (`n8n responded` + `output` field handling added), pending e2e run

Primary blocker REMOVED (silent drop fixed). Remaining: final e2e pass of the WhatsApp → n8n → reply loop, and the catalog-sync auth bug for new pharmacies. New untested surface: the entire voice-calls stack (Stage 9) — needs LiveKit creds to exercise.

## Open Bugs

| Bug | Severity | Status | Notes |
|---|---|---|---|
| Webhook silent message drop | **Critical** | **FIXED** (`72ee0f6`, 2026-06-03) | Root cause: debounce Redis key TTL = `windowMs` but the check ran at `windowMs + 100` — the key expired mid-wait, so EVERY message was dropped before n8n. TTL now outlives the wait. Reply-loop e2e pass still pending. |
| CORS blocked DELETE/PATCH | **High** | **FIXED** (`36453d3`) | `@fastify/cors` defaults to `GET,HEAD,POST` — WhatsApp disconnect (DELETE) and agent-config save (PATCH) were blocked at browser preflight. Methods now explicit. |
| Cross-tenant read on chats/customers | **High** | **FIXED** (`ab0c5c0`) | Both routes only ran `authenticate`, not `resolveStore` — any logged-in user could read another store's chats/customers by changing the `:storeId`. |
| Catalog sync auth for new pharmacies | **High** | Open | `catalog-sync.service` uses `config.odoo.user` (global admin email) to authenticate against new pharmacy Odoo DBs. This user doesn't exist in those DBs. Should use the store-specific owner email or the master admin credentials. Affects `farmacia_geremy`. |
| `disponibleVentas` always true | **Medium** | Open (product decision) | `catalogo.handler.ts` has `hit.stock > 0 \|\| true` — the bot reports everything as available. Flipping it depends on whether Odoo stock is real per pharmacy (inventory-connector strategy, ADR-007). |
| JWT stores field type mismatch | **Medium** | Fixed | JWT `stores` array contained MongoDB ObjectIds instead of `store_id` strings. Fixed in commit `e5f0749`. Needs retest confirmation. |

## Voice calls (Stage 9) — built, fully untested

The whole voice stack (session model, signed links, `/call/:id`, LiveKit token,
Python agent worker, per-pharmacy `voice_config` + super-admin editor) is built and
pushed but has **never been exercised end-to-end** — blocked on LiveKit Cloud creds
and the Dokploy `voice-agent` service env. See `stages/09-voice-calls.md` §10-11.
