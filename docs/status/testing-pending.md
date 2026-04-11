# Testing Pending

Components and flows that are **built and typechecked but have not been exercised end-to-end**. This is the highest-priority list before onboarding a real customer — every item here is a place where a surprise can land.

Updated: 2026-04-11 (end of Phase A + A.5 + B1-B5 session)

Legend:
- 🟢 **Verified** — actually invoked against real infrastructure and observed to work
- 🟡 **Partial** — some paths verified, others not
- 🔴 **Untested** — never exercised in a real call / UI flow

---

## Provisioning pipeline

| Flow | Status | Notes |
|---|---|---|
| `POST /api/v1/admin/pharmacies` → 7 steps → active | 🟡 | **Verified for the 6-step variant** (before `create_dashboard_admin` was added) via curl on `farmacia_test`. The 7-step version with the new `create_dashboard_admin` step has **never run**. First new-pharmacy creation after deploy is the real test. |
| `create_dashboard_admin` step | 🔴 | Entirely new in Phase A.5. Typechecked only. Needs: create new pharmacy, verify `Admin` doc appears in Mongo with `role=pharmacist` + correct stores, verify login with the provided credentials actually works. |
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
| `catalog-sync` periodic iteration across multiple active stores | 🔴 | Replaced hardcoded `['store_leo']` with `Store.find({status:'active'})`. Only one active store exists today, so the "iterates all" behavior has never been observed. **Create a second pharmacy and watch the next sync tick.** |
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
| `resolveStoreByInstance` lookup from Evolution instance name | 🔴 | **Entirely new.** Replaces the old naive `farmacia_` prefix strip. No Store in Mongo currently has `whatsapp_instance_id` set, so **zero real webhook traffic can resolve to a store right now**. This is a blocker before first real customer — see known gap in Stage 8 doc. |
| Store-resolver in-memory cache + 60s TTL | 🔴 | Cache logic written, never observed. |
| `invalidateStoreResolverCache` on agent-config save | 🔴 | Call site exists in `stores.routes.ts`. Never triggered. |
| `store_config` injection in n8n payload | 🔴 | The webhook handler now includes `store_config.agent.*`. No real webhook has been received since the change. |
| Debounce + mutex + handover + idempotency pipeline | 🟡 | All four services are unchanged from before Phase A. They worked in the previous deployment but have not been retested since the webhook handler was rewritten. |
| Bot reply actually sent to customer via Evolution | 🔴 | **Not implemented.** Logged as "Bot reply ready" — no Evolution POST. Known gap in Stage 8 doc. |

## Dashboard UI

| Page / flow | Status | Notes |
|---|---|---|
| Super-admin pharmacies list page | 🟡 | Loads after login (verified by user in browser). Create modal, details drawer, delete, retry buttons have never been clicked in the UI — everything in Phase A was tested via curl. |
| Create pharmacy modal → form submit → auto-refresh | 🔴 | Expected behavior: submit → 201 → auto-refresh polling picks up the new row with status transitioning. Never clicked. |
| Job progress steps in details drawer | 🔴 | UI reads `pharmacy.job.steps` and shows status badges. Only `farmacia_test`'s 6-step record existed briefly; since that was before `create_dashboard_admin` was added, the 7-step rendering is untested. |
| Credentials copy-to-clipboard panel | 🔴 | Needs a pharmacy whose `email_credentials` step has `admin_password` still in data. Will appear on the first new-pharmacy creation after deploy. |
| Mark-delivered button flow | 🔴 | Relies on the above. |
| Retry button on failed jobs | 🔴 | Needs an injected failure. |
| Delete button → confirm dialog → API call | 🔴 | Logic is there, never clicked. |
| Super-admin store switcher in header | 🔴 | Requires 2+ active stores. Right now only Farmacia Leo exists. Create a second pharmacy → expect dropdown to appear in header. |
| `/agent` "Mi Agente" config page | 🔴 | Loads, form renders, save PATCHes. Never saved. Live preview logic never rendered with user input. |
| Agent config — greeting-style radio buttons | 🔴 | |
| Agent config — character count on `custom_notes` | 🔴 | |

## Session tooling

| Flow | Status | Notes |
|---|---|---|
| Pharmacist login with credentials from a newly provisioned pharmacy | 🔴 | Depends on `create_dashboard_admin` actually having run. Requires: create new pharmacy → grab password from details drawer → log out as super-admin → log in as new pharmacist → verify they see only their own store's data. |
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

- Real webhook arriving with a valid Evolution instance name
- `resolveStoreByInstance` returning a real Store
- `store_config` payload actually being consumed by n8n agents
- End-to-end order creation from a WhatsApp message
- Reply back to the customer via Evolution (currently not implemented)

These are blocked on: (1) binding an Evolution instance to a Store, (2) user finishing n8n agents, (3) Evolution reply-sending being implemented.
