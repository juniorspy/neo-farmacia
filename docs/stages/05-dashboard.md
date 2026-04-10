# Stage 5: Dashboard (The Face)

**Status**: `pending`
**Depends on**: Stage 2 (Microservice), Stage 4 (WhatsApp)
**Goal**: Web panel where pharmacy owners manage everything — orders, chats, WhatsApp numbers, inventory, multiple locations, and stats.

## Why

This replaces the Android app from neo colmado. The pharmacist does everything from the browser: see orders, print receipts, take over chats, manage WhatsApp connections, and view reports across all their locations.

## Deliverables

### 5A — Backend API (Fastify, same packages/api)

- [ ] **Auth**
  - [ ] JWT authentication (login, validate, refresh)
  - [ ] Roles: `admin` (platform-wide) and `pharmacist` (store-scoped)
  - [ ] Store-scoped access control (pharmacist sees only their stores)

- [ ] **Orders**
  - [ ] `GET /api/v1/stores/:store_id/orders` — list orders (filterable by status)
  - [ ] `GET /api/v1/stores/:store_id/orders/:order_id` — order detail
  - [ ] `PATCH /api/v1/stores/:store_id/orders/:order_id/status` — despachar, cancelar
  - [ ] `PATCH /api/v1/stores/:store_id/orders/:order_id/items/:item_id` — edit price, mark "no hay"

- [ ] **Chats & Handover**
  - [ ] `GET /api/v1/stores/:store_id/chats` — active chats with last message
  - [ ] `GET /api/v1/stores/:store_id/chats/:chat_id/messages` — conversation history
  - [ ] `POST /api/v1/stores/:store_id/chats/:chat_id/messages` — send manual message
  - [ ] `PUT /api/v1/stores/:store_id/chats/:chat_id/mode` — switch bot/manual

- [ ] **WhatsApp Management**
  - [ ] `POST /api/v1/stores/:store_id/whatsapp/numbers/connect` — add number
  - [ ] `GET /api/v1/stores/:store_id/whatsapp/numbers` — list connected numbers
  - [ ] `GET /api/v1/stores/:store_id/whatsapp/numbers/:id/status` — connection status + QR
  - [ ] `DELETE /api/v1/stores/:store_id/whatsapp/numbers/:id` — disconnect number
  - [ ] `PUT /api/v1/stores/:store_id/whatsapp/numbers/default` — set default

- [ ] **Catalog (from Odoo)**
  - [ ] `GET /api/v1/stores/:store_id/products` — list products from Odoo
  - [ ] `GET /api/v1/stores/:store_id/products/:id` — product detail (stock, lots, expiry)
  - [ ] `PUT /api/v1/stores/:store_id/products/:id` — update product in Odoo
  - [ ] `POST /api/v1/stores/:store_id/products` — create product in Odoo

- [ ] **Customers**
  - [ ] `GET /api/v1/stores/:store_id/customers` — list customers
  - [ ] `GET /api/v1/stores/:store_id/customers/:id` — customer detail + order history

- [ ] **Multi-store**
  - [ ] `GET /api/v1/owners/:owner_id/stores` — list stores for an owner
  - [ ] Owner-to-stores mapping in MongoDB

- [ ] **Stats & Reports**
  - [ ] `GET /api/v1/stores/:store_id/stats/summary` — today's orders, revenue, pending
  - [ ] `GET /api/v1/stores/:store_id/stats/sales` — sales by period (day/week/month)
  - [ ] `GET /api/v1/stores/:store_id/stats/products` — top products
  - [ ] `GET /api/v1/stores/:store_id/stats/agent` — bot vs human handled

- [ ] **WebSocket**
  - [ ] Real-time events: new_order, order_updated, new_message, handover_changed
  - [ ] Scoped by store_id (pharmacist only receives their store's events)

### 5B — Frontend (Next.js)

- [ ] **Layout**: Sidebar nav, header with store selector, responsive
- [ ] **Login page**: JWT auth
- [ ] **Orders page**: Real-time list, status badges, despachar/cancelar actions
- [ ] **Order detail**: Items, totals, customer info, print receipt button
- [ ] **Chat inbox**: WhatsApp-style, left panel = conversations, right panel = messages
- [ ] **Handover toggle**: Switch bot/manual per chat
- [ ] **WhatsApp page**: Connected numbers, QR scanner, status indicators
- [ ] **Store selector**: Dropdown for multi-location owners
- [ ] **Products page**: Table with search, inline edit, stock/expiry info
- [ ] **Customers page**: List with search, click to see profile + history
- [ ] **Reports page**: Charts — sales trends, top products, agent performance
- [ ] **Settings page**: Store info, agent config

## Printing

Browser-based thermal printing options:
- **WebUSB API** — direct USB printer access (Chrome)
- **Web Bluetooth** — Bluetooth thermal printers
- **Print dialog** — CSS-formatted receipt via `window.print()`
- **Print server** — local service that receives ESC/POS commands

Decision on approach to be made during implementation.

## Decisions

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
