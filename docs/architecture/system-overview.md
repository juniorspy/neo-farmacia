# System Architecture Overview

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VPS (Docker/Dokploy)                       │
│                                                                     │
│  ┌──────────┐    ┌──────────────────────┐    ┌──────────────────┐  │
│  │ Evolution │    │   Microservice       │    │      n8n         │  │
│  │   API     │◄──►│   (Fastify + TS)     │◄──►│  (AI Agents)     │  │
│  │ WhatsApp  │    │                      │    │  5 agents:       │  │
│  │ Gateway   │    │  ┌─────────────┐     │    │  - Intention     │  │
│  └──────────┘    │  │ Webhook     │     │    │  - Dialogue      │  │
│       ▲          │  │ Debounce    │     │    │  - Cart          │  │
│       │          │  │ Handover    │     │    │  - Registration  │  │
│       │          │  │ Odoo Proxy  │     │    │  - Fallback      │  │
│  ┌────┴────┐     │  │ Message Log │     │    └──────────────────┘  │
│  │WhatsApp │     │  │ Dashboard   │     │                          │
│  │ Users   │     │  │ API         │     │    ┌──────────────────┐  │
│  └─────────┘     │  └─────────────┘     │    │    Odoo 17       │  │
│                  │         │  ▲          │    │   (PostgreSQL)   │  │
│                  └─────────┼──┼──────────┘    │   Inventory SSoT │  │
│                            │  │               └──────────────────┘  │
│                    ┌───────┴──┴───────┐                             │
│                    │                  │       ┌──────────────────┐  │
│                ┌───┴────┐      ┌─────┴──┐    │  POS Sync        │  │
│                │MongoDB │      │ Redis  │    │  (optional)      │  │
│                │ Chats  │      │ State  │    │  SQL Server/MySQL│  │
│                │ Users  │      │ Cache  │    │  → Odoo          │  │
│                └────────┘      └────────┘    └──────────────────┘  │
│                                                                     │
│                  ┌──────────────────────┐                           │
│                  │   Dashboard (Next.js)│                           │
│                  │   Pharmacist Panel   │                           │
│                  └──────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Customer Orders via WhatsApp

```
1. Customer sends "necesito paracetamol 500mg" on WhatsApp

2. Evolution API receives → POST webhook to Microservice

3. Microservice:
   a. Responds 200 OK immediately
   b. Checks idempotency (message ID in Redis) → skip if duplicate
   c. Starts debounce timer (Redis, 2s)
   d. If more messages arrive within 2s → accumulate
   e. On debounce expiry:
      - Check handover state (Redis) → if manual, skip
      - Acquire conversation mutex (Redis SETNX)
      - Log message to MongoDB
      - Send typing indicator via Evolution
      - Forward enriched payload to n8n webhook

4. n8n:
   a. Intention Agent classifies: [buscar_producto]
   b. Dialogue Agent calls POST /api/v1/products/search
      → Microservice queries Odoo → returns "Paracetamol 500mg, RD$85, 50 en stock"
   c. Dialogue Agent responds with product info + [Tool: agregar...]
   d. Cart Agent calls POST /api/v1/orders/update
      → Microservice creates Sale Order in Odoo
   e. n8n returns response text to microservice

5. Microservice:
   a. Check handover state again (egress check)
   b. Release conversation mutex
   c. Send reply via Evolution API
   d. Log outbound message to MongoDB
   e. Emit WebSocket event: new_order (to Dashboard)

6. Customer receives: "Paracetamol 500mg agregado. RD$85. ¿Algo más?"

7. Dashboard: Pharmacist sees order appear in real-time
```

## Data Flow: Pharmacist Dispatches Order

```
1. Pharmacist clicks "Despachar" on Dashboard

2. Dashboard: PATCH /api/v1/stores/:id/orders/:id/status { status: "dispatched" }

3. Microservice:
   a. Updates order status in Odoo (confirm Sale Order)
   b. Updates order in MongoDB (for history)
   c. Emits WebSocket: order_updated
   d. (Optional) Sends WhatsApp notification to customer

4. Dashboard updates order card to "Despachado"
```

## Data Ownership

| Data | Primary Store | Why |
|---|---|---|
| Products, stock, lots, expiry, prices | **Odoo** | SSoT for inventory |
| Sale Orders | **Odoo** | SSoT for sales/accounting |
| Chat messages | **MongoDB** | High write volume, flexible schema |
| User profiles | **MongoDB** | Tied to chat, not inventory |
| Session state (bot/manual) | **Redis** | Ephemeral, fast access |
| Debounce timers | **Redis** | Ephemeral, TTL-based |
| Conversation mutex | **Redis** | Ephemeral, TTL-based |
| Product search cache | **Redis** | Cache of Odoo data, TTL 5min |
| Store config | **MongoDB** | Owner settings, WhatsApp numbers |

## Multi-Tenant Isolation

Every piece of data is scoped by `store_id`:
- MongoDB: compound indexes always start with `store_id`
- Redis: keys prefixed with `{store_id}:`
- Odoo: multi-company, each store = company
- API: every route includes `store_id`, validated against JWT
- WebSocket: events filtered by `store_id`
