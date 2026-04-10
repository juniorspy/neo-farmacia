# Stage 5: Dashboard (The Face)

**Status**: `in_progress`
**Depends on**: Stage 2 (Microservice)
**Goal**: Web panel where pharmacy owners manage everything — orders, chats, WhatsApp numbers, inventory, multiple locations, and stats.

## Why

This replaces the Android app from neo colmado. The pharmacist does everything from the browser: see orders, print receipts, take over chats, manage WhatsApp connections, and view reports across all their locations.

## Deliverables

### 5B — Frontend (Next.js) ✅ DONE

- [x] **Project setup**: Next.js 16 + TypeScript + Tailwind CSS + App Router
- [x] **Layout**: Sidebar nav (collapsible), header with store selector, responsive
- [x] **Login page**: JWT auth + dev shortcut for testing
- [x] **Auth system**: AuthProvider context, JWT token management, route protection
- [x] **Store selector**: Multi-store support with StoreProvider context
- [x] **Theme system**: Dynamic primary color (12 presets + custom hex picker), logo upload, persisted in localStorage, CSS custom properties propagate to all components
- [x] **Dashboard home**: Date range filters (Hoy/Semana/Mes/Año), 5 stat cards, sales by day bar chart, donut orders by status, weekday sales, hourly activity, top 10 products, top 10 customers, categories, agent performance
- [x] **Orders page**: Tabs by status, search, order list with badges, detail side panel, actions (marcar listo, despachar, cancelar, imprimir)
- [x] **Chat inbox**: WhatsApp-style layout, left=conversations, right=messages, bot/manual toggle, unread badges, send message input
- [x] **Products page**: Table with search, stock/expiry info, low stock alerts
- [x] **Customers page**: Cards with stats (pedidos, gastado, último pedido), search, registered badge
- [x] **WhatsApp page**: Connected numbers, status indicators (connected/disconnected/QR), connect/disconnect actions
- [x] **Reports page**: Full statistics — date filters + AI Análisis button, 5 stat cards, sales by day, donut orders by status, weekday sales, hourly activity (24h with tooltips), top 10 products (horizontal bars with ranking), top 10 customers (ranked list), agent performance (bot vs manual cards + metrics), categories with totals
- [x] **Settings page**: Appearance (color picker + logo upload + live preview), store info, agent config (welcome message, auto-response toggle)

**All pages use mock data — will connect to real API endpoints next.**

### 5A — Backend API (Fastify, same packages/api) — PENDING

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
  - [ ] `PUT /api/v1/stores/:store_id/chats/:chat_id/mode` — switch bot/manual (already exists)

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

## Tech Stack (Frontend)

| Library | Version | Purpose |
|---|---|---|
| Next.js | 16.2.3 | App Router, SSR/SSG |
| React | 19.x | UI framework |
| Tailwind CSS | 4.x | Styling |
| lucide-react | latest | Icons |
| clsx | latest | Conditional classes |

## Architecture Decisions

- **CSS custom properties for theming** — instead of Tailwind theme config, we use CSS vars (`--primary`, `--sidebar-bg`, etc.) set dynamically via JS. This allows runtime color changes without rebuild.
- **localStorage for theme/auth** — theme config and JWT token stored in localStorage. Will move to httpOnly cookies for JWT in production.
- **Mock data first** — all pages built with mock data to validate UX before connecting API. Pattern: replace mock imports with `api.get()` calls.
- **Route groups** — `(dashboard)` group wraps all authenticated pages with Shell/Auth/Store/Theme providers. `/login` lives outside.
- **Collapsible sidebar** — persisted in localStorage, collapses to 72px icon-only mode.

## Printing

Browser-based thermal printing options:
- **WebUSB API** — direct USB printer access (Chrome)
- **Web Bluetooth** — Bluetooth thermal printers
- **Print dialog** — CSS-formatted receipt via `window.print()`
- **Print server** — local service that receives ESC/POS commands

Decision on approach to be made during implementation.

## File Structure

```
packages/dashboard/src/
├── app/
│   ├── globals.css           # Theme CSS vars + utility classes
│   ├── layout.tsx            # Root layout (fonts, metadata)
│   ├── login/page.tsx        # Login page (outside auth guard)
│   └── (dashboard)/
│       ├── layout.tsx        # Auth + Store + Theme providers + Shell
│       ├── page.tsx          # Dashboard home (stats, charts, lists)
│       ├── orders/page.tsx   # Orders management
│       ├── chats/page.tsx    # Chat inbox
│       ├── products/page.tsx # Product catalog
│       ├── customers/page.tsx # Customer list
│       ├── whatsapp/page.tsx # WhatsApp numbers
│       ├── reports/page.tsx  # Full statistics
│       └── settings/page.tsx # Theme + store + agent config
├── components/
│   ├── sidebar.tsx           # Collapsible nav with theme colors
│   ├── header.tsx            # Header with store selector + avatar
│   ├── shell.tsx             # Layout wrapper (sidebar + header + main)
│   └── stat-card.tsx         # Reusable stat card
└── lib/
    ├── api.ts                # HTTP client with JWT
    ├── auth.tsx              # Auth context + dev mode
    ├── store.tsx             # Store selector context
    └── theme.tsx             # Theme context (color + logo)
```

## Blockers

_(none currently)_

## Session References

- 2026-04-10: Frontend scaffold, all pages, theme system, reports page
