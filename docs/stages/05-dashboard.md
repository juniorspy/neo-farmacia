# Stage 5: Dashboard (The Face)

**Status**: `done`
**Depends on**: Stage 2 (Microservice)
**Goal**: Web panel where pharmacy owners manage everything — orders, chats, WhatsApp numbers, inventory, multiple locations, and stats.

## Why

This replaces the Android app from neo colmado. The pharmacist does everything from the browser: see orders, print receipts, take over chats, manage WhatsApp connections, and view reports across all their locations.

## Deliverables

### 5B — Frontend (Next.js) ✅ DONE

- [x] **Project setup**: Next.js 16 + TypeScript + Tailwind CSS + App Router
- [x] **Layout**: Sidebar nav (collapsible), header with store selector, responsive
- [x] **Login page**: JWT auth against real API
- [x] **Auth system**: AuthProvider context, JWT token management, route protection
- [x] **Store selector**: Multi-store support with StoreProvider context
- [x] **Theme system**: Dynamic primary color (12 presets + custom hex picker), logo upload, persisted in localStorage, CSS custom properties propagate to all components
- [x] **Dashboard home**: Real data — stat cards, sales by day, donut orders by status, weekday sales, hourly activity, top 10 products, top 10 customers, agent performance
- [x] **Orders page**: Real Odoo data — tabs by status, search, detail panel with order lines, actions (confirm, dispatch, cancel)
- [x] **Chat inbox**: Real MongoDB data — conversations list, messages, send manual message, bot/manual indicator
- [x] **Products page**: Real Odoo data — table with search, stock, categories, barcodes, low stock alerts
- [x] **Customers page**: Real MongoDB data — cards with registered badge, empty state
- [x] **WhatsApp page**: Real Evolution API — list instances, create, delete, connection status
- [x] **Reports page**: Real data — stat cards, sales by day, donut, weekday sales, hourly activity, top 10 products, top 10 customers, agent performance (bot vs manual)
- [x] **Settings page**: Appearance (color picker + logo upload + live preview), store info, agent config

### 5A — Backend API (Fastify) ✅ DONE

- [x] **Auth**
  - [x] JWT authentication (login, validate via @fastify/jwt)
  - [x] Admin model (email, bcrypt password, role, stores)
  - [x] `POST /api/v1/auth/login` — returns JWT + user
  - [x] `GET /api/v1/auth/me` — returns current user (protected)
  - [x] Auto-seed default admin on first boot
  - [x] `app.authenticate` decorator for protected routes

- [x] **Orders**
  - [x] `GET /api/v1/stores/:storeId/orders` — list from Odoo (filterable by status)
  - [x] `GET /api/v1/stores/:storeId/orders/:orderId` — detail with order lines
  - [x] `PATCH /api/v1/stores/:storeId/orders/:orderId/status` — confirm, dispatch, cancel

- [x] **Chats & Handover**
  - [x] `GET /api/v1/stores/:storeId/chats` — active chats with last message + mode
  - [x] `GET /api/v1/stores/:storeId/chats/:chatId/messages` — conversation history
  - [x] `POST /api/v1/stores/:storeId/chats/:chatId/messages` — send manual message

- [x] **WhatsApp Management**
  - [x] `GET /api/v1/stores/:storeId/whatsapp/instances` — list Evolution instances
  - [x] `POST /api/v1/stores/:storeId/whatsapp/instances` — create instance
  - [x] `GET /api/v1/stores/:storeId/whatsapp/instances/:name/qr` — get QR code
  - [x] `GET /api/v1/stores/:storeId/whatsapp/instances/:name/status` — connection status
  - [x] `DELETE /api/v1/stores/:storeId/whatsapp/instances/:name` — delete instance

- [x] **Catalog (from Odoo)**
  - [x] `GET /api/v1/stores/:storeId/products` — list with search, categories
  - [x] `GET /api/v1/stores/:storeId/products/:productId` — detail

- [x] **Customers**
  - [x] `GET /api/v1/stores/:storeId/customers` — list with search
  - [x] `GET /api/v1/stores/:storeId/customers/:customerId` — detail

- [x] **Stats & Reports**
  - [x] `GET /api/v1/stores/:storeId/stats/summary` — orders, revenue, customers
  - [x] `GET /api/v1/stores/:storeId/stats/agent` — bot vs manual percentages
  - [x] `GET /api/v1/stores/:storeId/stats/charts` — daily sales, weekday sales, hourly activity, orders by status, top products, top customers

## Deployment

Both services deployed on Dokploy as independent Applications connected to GitHub for auto-deploy on push:

| Service | URL | Build Path |
|---|---|---|
| API | `api.leofarmacia.com` | `./packages/api` |
| Dashboard | `app.leofarmacia.com` | `./packages/dashboard` |

## Pending / Future

- [ ] WebSocket for real-time updates (new_order, new_message, handover_changed)
- [ ] Settings save to backend (currently localStorage only)
- [ ] Date range filters actually filter API data
- [ ] Printing (WebUSB, Bluetooth, or print dialog)
- [ ] Store-scoped access control (pharmacist sees only their stores)

## Architecture Decisions

- **CSS custom properties for theming** — runtime color changes without rebuild
- **Dockerfile with ARG for API URL** — `NEXT_PUBLIC_API_URL` baked at build time
- **Dokploy Applications** — each service connected to same GitHub repo, different build paths, auto-deploy on push
- **Odoo as SSoT for orders/products** — dashboard reads directly from Odoo via JSON-RPC
- **MongoDB for chats/customers** — messages and user data stored locally for fast queries

## Session References

- 2026-04-10-02: Frontend scaffold, all pages, theme system
- 2026-04-10-03: Auth module, backend API endpoints, real data connection, Dokploy deployment
