# API Reference

All endpoints exposed by the Fastify API at `https://api.leofarmacia.com`.

## Authentication

JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Dashboard endpoints (marked `JWT`) require a valid token obtained from `POST /api/v1/auth/login`. Public endpoints (webhook, n8n callbacks) have no auth yet.

## Health

### `GET /health`
No auth. Service liveness check.

```json
{ "status": "ok", "service": "neo-farmacia-api", "timestamp": "..." }
```

## Auth

### `POST /api/v1/auth/login`
```json
// Request
{ "email": "admin@leofarmacia.com", "password": "admin123" }

// Response 200
{
  "token": "eyJhbG...",
  "user": {
    "id": "...",
    "name": "Administrador",
    "email": "admin@leofarmacia.com",
    "role": "admin",
    "stores": [{ "id": "store_leo", "name": "Farmacia Leo" }]
  }
}
```

### `GET /api/v1/auth/me` — JWT
Returns the current user from the JWT payload.

## Orders (Odoo-backed) — JWT

### `GET /api/v1/stores/:storeId/orders`
Query params: `status`, `limit`, `offset`.

```json
[
  {
    "id": 21,
    "name": "S00021",
    "customer": "María López",
    "customerId": 11,
    "date": "2026-04-10 05:16:27",
    "total": 2501.25,
    "status": "ready",
    "odooState": "sale"
  }
]
```

Status mapping (Dashboard ↔ Odoo):
| Dashboard | Odoo |
|---|---|
| `pending` | `draft` or `sent` |
| `ready` | `sale` |
| `dispatched` | `done` |
| `cancelled` | `cancel` |

### `GET /api/v1/stores/:storeId/orders/:orderId`
Returns order with `lines`:
```json
{
  "id": 21, "name": "S00021", "status": "ready",
  "lines": [
    { "id": 1, "productId": 43, "name": "Paracetamol 500mg", "qty": 2, "price": 85, "subtotal": 170 }
  ]
}
```

### `PATCH /api/v1/stores/:storeId/orders/:orderId/status`
```json
// Request
{ "status": "dispatched" }  // pending | ready | dispatched | cancelled
```

Maps to Odoo workflow:
| Status | Odoo action |
|---|---|
| `ready` | `action_confirm` |
| `dispatched` | `action_done` |
| `cancelled` | `action_cancel` |
| `pending` | `action_draft` |

## Chats (MongoDB-backed) — JWT

### `GET /api/v1/stores/:storeId/chats`
Returns aggregated chats with last message + handover mode.

### `GET /api/v1/stores/:storeId/chats/:chatId/messages`
Query: `limit` (default 50), `before` (ISO date).

### `POST /api/v1/stores/:storeId/chats/:chatId/messages`
```json
{ "text": "Hola, su pedido está listo" }
```
Saves to MongoDB with `sender: "agent"`, `direction: "outbound"`.

## Handover — JWT

### `GET /api/v1/stores/:storeId/chats/:chatId/mode`
Returns `{ mode: "bot" | "manual" }`.

### `PUT /api/v1/stores/:storeId/chats/:chatId/mode`
```json
{ "mode": "manual" }
```

## Customers (MongoDB-backed) — JWT

### `GET /api/v1/stores/:storeId/customers`
Query: `search` (matches name or phone).

### `GET /api/v1/stores/:storeId/customers/:customerId`

## Products (Odoo-backed) — JWT

### `GET /api/v1/stores/:storeId/products`
Query: `search`, `limit`, `offset`.

```json
[
  {
    "id": 43,
    "name": "Paracetamol 500mg",
    "price": 85,
    "stock": 50,
    "category": "Medicamentos / OTC",
    "barcode": "7861234500003",
    "tracking": "lot",
    "hasExpiry": true
  }
]
```

### `GET /api/v1/stores/:storeId/products/:productId`

## Stats — JWT

### `GET /api/v1/stores/:storeId/stats/summary`
Query: `range` (`today | week | month | year`).

```json
{
  "totalOrders": 142,
  "pendingOrders": 8,
  "completedOrders": 118,
  "totalRevenue": 87200,
  "avgPerOrder": 614,
  "totalCustomers": 67,
  "periodMessages": 312
}
```

### `GET /api/v1/stores/:storeId/stats/agent`
```json
{
  "botMessages": 234,
  "agentMessages": 66,
  "totalMessages": 300,
  "botPct": 78,
  "agentPct": 22
}
```

### `GET /api/v1/stores/:storeId/stats/charts`
Query: `range` (`today | week | month | year`).

Returns all chart data in one call:
```json
{
  "dailySales": [{ "date": "04 Abr", "value": 8200 }, ...],
  "weekdaySales": [{ "day": "Lun", "value": 12500 }, ...],
  "hourlyActivity": [0, 0, ..., 18, 22, 15, ...],  // 24 ints
  "ordersByStatus": [{ "label": "Pendiente", "count": 8, "color": "#f59e0b" }, ...],
  "topProducts": [{ "name": "...", "qty": 145, "total": 21750 }, ...],
  "topCustomers": [{ "name": "...", "orders": 23, "total": 15800 }, ...]
}
```

## WhatsApp (Evolution API proxy) — JWT

### `GET /api/v1/stores/:storeId/whatsapp/instances`
### `POST /api/v1/stores/:storeId/whatsapp/instances`
Body: `{ "name": "farmacia-leo-principal" }`
### `GET /api/v1/stores/:storeId/whatsapp/instances/:name/qr`
### `GET /api/v1/stores/:storeId/whatsapp/instances/:name/status`
### `DELETE /api/v1/stores/:storeId/whatsapp/instances/:name`

## Webhook (Public, Evolution → API)

### `POST /webhook/evolution`
Raw payload from Evolution API. Runs the full pipeline: idempotency check → debounce → handover check → mutex → forward to n8n → reply.

## n8n Callbacks (Public, n8n → API)

### `POST /api/v1/products/search`
```json
{ "query": "paracetamol", "storeId": "store_leo", "limit": 10 }
```

### `POST /api/v1/orders/update`
```json
{
  "storeId": "store_leo",
  "chatId": "...",
  "customerName": "María López",
  "customerPhone": "+1809...",
  "items": [{ "productId": 43, "quantity": 2, "price": 85 }]
}
```

### `POST /api/v1/users/lookup`
```json
{ "storeId": "store_leo", "chatId": "...", "phone": "...", "name": "...", "address": "..." }
```

## Error Format

All errors follow:
```json
{ "error": "Human readable message" }
```

Common codes:
- `400` — missing or invalid body params
- `401` — missing/invalid JWT
- `404` — resource not found
- `500` — server error (logged with full stack on the backend)
