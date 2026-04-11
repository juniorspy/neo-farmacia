# Architecture

## System Overview

Neo Farmacia is a multi-tenant SaaS for pharmacies. It has three main components: a web dashboard, an HTTP API, and a WhatsApp agent pipeline.

```
┌──────────────────────────────────────────────────────────────┐
│                         VPS (Dokploy)                        │
│                                                              │
│   ┌─────────┐       ┌─────────────┐       ┌──────────────┐  │
│   │Evolution│       │  Fastify    │       │     n8n      │  │
│   │  API    │◄─────►│  API        │◄─────►│  (5 agents)  │  │
│   │(WhatsApp│       │             │       │              │  │
│   │ gateway)│       │ webhook,    │       │  Intention,  │  │
│   └─────────┘       │ auth,       │       │  Dialogue,   │  │
│        ▲            │ orders,     │       │  Cart,       │  │
│        │            │ chats,      │       │  Registration│  │
│   ┌────┴────┐       │ stats,      │       │  Fallback    │  │
│   │Pharmacy │       │ products,   │       └──────────────┘  │
│   │customers│       │ whatsapp    │                         │
│   └─────────┘       └──┬──────────┘                         │
│                        │  ▲                                 │
│                        │  │                                 │
│                 ┌──────┴──┴──────┐                          │
│                 │                │       ┌──────────────┐   │
│              ┌──┴───┐      ┌─────┴──┐    │   Odoo 17    │   │
│              │Mongo │      │ Redis  │    │ (PostgreSQL) │   │
│              │  DB  │      │        │    │  Inventory   │   │
│              └──────┘      └────────┘    │     SSoT     │   │
│                                          └──────┬───────┘   │
│                                                 │           │
│                 ┌────────────────────┐          │           │
│                 │  Next.js Dashboard │──────────┘           │
│                 │  (Pharmacist UI)   │ (via API)            │
│                 └────────────────────┘                      │
└──────────────────────────────────────────────────────────────┘
```

## Components

### Fastify API (`packages/api`)
Single Node.js process that acts as the central hub. Handles:
- **WhatsApp webhook** — receives events from Evolution API
- **Dashboard API** — REST endpoints for the pharmacist panel (JWT-protected)
- **n8n callbacks** — public endpoints that the AI agents call to query Odoo
- **Odoo proxy** — reads/writes inventory and sale orders via JSON-RPC
- **Auth** — JWT login, admin user management

### Next.js Dashboard (`packages/dashboard`)
Server-rendered React app. All pages run client-side after initial load. Talks to the Fastify API via fetch + JWT. Runs in a separate container, served on `app.leofarmacia.com`.

### Odoo 17 (external)
ERP used as the single source of truth for inventory, products, customers (res.partner), and sale orders. Accessed exclusively via JSON-RPC. Runs in its own container.

### MongoDB
Stores data that Odoo doesn't own well:
- **Admins** (dashboard users, with hashed passwords)
- **Users** (WhatsApp customers, by chat_id)
- **Messages** (full chat history, per store_id)

### Redis
Ephemeral state and cache:
- **Debounce timers** — accumulate rapid messages before sending to n8n
- **Conversation mutex** — prevent concurrent n8n calls per chat
- **Handover state** — whether each chat is in bot or manual mode
- **Idempotency keys** — skip duplicate webhook events
- **Product cache** — Odoo search results, 5 min TTL

### n8n (external)
Visual workflow engine that hosts the 5 AI agents. Called from the Fastify API via webhook.

### Evolution API (external)
WhatsApp gateway. Delivers inbound messages to the Fastify webhook and sends outbound text/typing indicators back.

## Data Flow: Customer orders via WhatsApp

```
1. Customer sends "necesito paracetamol 500mg" on WhatsApp

2. Evolution API → POST https://api.leofarmacia.com/webhook/evolution

3. Fastify webhook handler:
   a. Replies 200 OK immediately
   b. Idempotency check (Redis: idempotent:{message_id}) → skip if seen
   c. Log inbound message to MongoDB
   d. Start debounce timer (Redis: debounce:{store}:{chat}, 2s)
   e. If more messages arrive within 2s → accumulate
   f. On debounce expiry:
      - Check handover (Redis: session:{store}:{chat}) → if manual, skip
      - Acquire mutex (Redis SETNX: mutex:{store}:{chat})
      - Forward accumulated text to n8n webhook

4. n8n:
   a. Intention Agent classifies: "buscar_producto"
   b. Dialogue Agent calls POST /api/v1/products/search
      → Fastify queries Odoo → returns products
   c. Cart Agent calls POST /api/v1/orders/update
      → Fastify creates sale.order in Odoo
   d. n8n returns response text

5. Fastify:
   a. Egress handover check (may have flipped to manual mid-call)
   b. Release mutex
   c. Send reply via Evolution API
   d. Log outbound message to MongoDB

6. Customer receives the reply in WhatsApp

7. Pharmacist sees the new order in the Dashboard (next refresh / websocket)
```

## Data Flow: Pharmacist dispatches order

```
1. Pharmacist clicks "Despachar" in the Dashboard

2. Dashboard: PATCH /api/v1/stores/{store_id}/orders/{id}/status
   Authorization: Bearer {jwt}
   Body: { "status": "dispatched" }

3. Fastify:
   a. JWT middleware validates token
   b. Maps "dispatched" → Odoo action "action_done"
   c. Calls Odoo via JSON-RPC
   d. Returns success

4. Dashboard reloads the order list
```

## Data Flow: Pharmacist prints receipt

```
1. Pharmacist clicks Printer icon on a ready order

2. Dashboard (client-side):
   a. Fetches order detail (if not already loaded)
   b. Generates ESC/POS bytes with ReceiptBuilder (lib/printer.ts)
   c. Opens Bluetooth GATT connection to paired printer
   d. Writes bytes in 512-byte chunks
   e. Printer prints

No API involvement — printing happens entirely in the browser.
```

## Multi-Tenant Isolation

Every piece of persistent data is scoped by `store_id`:

| Layer | How |
|---|---|
| **MongoDB** | Compound indexes start with `store_id`; queries always filter by it |
| **Redis** | Keys prefixed `{store_id}:{chat_id}:...` |
| **Odoo** | Currently single company; future: multi-company, one per store |
| **API** | Every dashboard route includes `:storeId` in the path |
| **JWT** | Admin payload includes `stores[]`; access control check (future) |

## Service Dependencies

```
Dashboard ──► API ──► Odoo (JSON-RPC)
                 ──► MongoDB
                 ──► Redis
                 ──► Evolution API (HTTP)
                 ──► n8n (HTTP webhook)

Evolution API ──► API (/webhook/evolution)
n8n ──► API (/api/v1/products/search, /orders/update, /users/lookup)
```

All services run in the same Docker network on the VPS (`dokploy-network`), so they resolve each other by container name.
