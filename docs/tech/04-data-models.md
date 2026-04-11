# Data Models

Where each kind of data lives and what its schema looks like.

## MongoDB Collections

### `admins`
Dashboard users (pharmacists, administrators).

| Field | Type | Notes |
|---|---|---|
| `email` | String, unique | Lowercase |
| `password` | String | bcrypt hashed, never returned |
| `name` | String | Display name |
| `role` | String | `admin` or `pharmacist` |
| `stores` | Array<{id, name}> | Stores this admin can access |
| `active` | Boolean | Soft delete flag |
| `created_at` / `updated_at` | Date | Timestamps |

Indexes: `email` unique.
Seeded on first boot if collection is empty (admin@leofarmacia.com / admin123).

### `users`
WhatsApp customers. One per (store_id, chat_id).

| Field | Type | Notes |
|---|---|---|
| `store_id` | String | Tenant key |
| `chat_id` | String | Evolution remoteJid |
| `phone` | String | E.164 |
| `name` | String | Provided by customer or WhatsApp pushName |
| `address` | String | Optional delivery address |
| `registered` | Boolean | Has completed registration flow |
| `created_at` / `updated_at` | Date | |

Indexes:
- `(store_id, chat_id)` unique — primary lookup
- `(store_id, phone)` — phone search

### `messages`
Every inbound and outbound message, for history and audit.

| Field | Type | Notes |
|---|---|---|
| `store_id` | String | |
| `chat_id` | String | |
| `message_id` | String, unique | From Evolution or synthesized (`agent_{ts}`) |
| `direction` | String | `inbound` or `outbound` |
| `text` | String | Plain text content |
| `sender` | String | `customer` / `bot` / `agent` |
| `timestamp` | Date | Message time |
| `meta` | Object | `phone`, `pushName`, `source`, `instanceName`, `messageType` |

Indexes:
- `(store_id, chat_id, timestamp)` — fetch chat history
- `(store_id, timestamp)` — global store feed
- `message_id` unique — idempotency

## Odoo Entities (read/written via JSON-RPC)

### `product.product`
Fields used by the API:

| Field | Purpose |
|---|---|
| `name` | Product name |
| `list_price` | Selling price |
| `qty_available` | On-hand stock |
| `categ_id` | Category (many2one) |
| `barcode` | Barcode |
| `tracking` | `lot`, `serial`, or `none` |
| `use_expiration_date` | Has expiry tracking |
| `sale_ok` | Must be true for it to appear in searches |

### `sale.order`
| Field | Purpose |
|---|---|
| `name` | Order reference (e.g. `S00021`) |
| `partner_id` | Customer (many2one to res.partner) |
| `date_order` | Order date |
| `amount_total` | Total with taxes |
| `state` | Workflow state (`draft`/`sent`/`sale`/`done`/`cancel`) |
| `order_line` | Many2many to sale.order.line |

State transitions called:
- `action_confirm` — draft → sale
- `action_done` — sale → done (lock)
- `action_cancel` — any → cancel
- `action_draft` — cancel → draft

### `sale.order.line`
| Field | Purpose |
|---|---|
| `product_id` | Many2one to product.product |
| `product_uom_qty` | Quantity |
| `price_unit` | Unit price |
| `price_subtotal` | Line total |
| `name` | Description |

### `res.partner`
Customers in Odoo. `findOrCreatePartner(name, phone)` looks up by phone first, creates with `customer_rank: 1` if missing.

## Redis Keys

All keys include `{store_id}:{chat_id}` where applicable for multi-tenant isolation.

| Key pattern | Type | TTL | Purpose |
|---|---|---|---|
| `idempotent:{message_id}` | string | 1h | Skip duplicate webhook events |
| `debounce:{store}:{chat}` | string (JSON) | 2s sliding | Accumulate rapid messages |
| `mutex:{store}:{chat}` | string | 30s | Prevent concurrent n8n calls per chat |
| `session:{store}:{chat}` | string (`bot`/`manual`) | none | Handover state |
| `cache:products:{store}:{query}` | string (JSON) | 5min | Odoo search cache |

Redis connection is a single shared ioredis instance in `src/shared/redis.ts`. Graceful shutdown on SIGINT.

## Frontend Storage (localStorage)

The dashboard stores a few things in `localStorage`. All client-side only.

| Key | Value | Purpose |
|---|---|---|
| `token` | JWT string | Authentication |
| `dev-user` | JSON | Dev-mode user (bypasses API when token is `dev-token`) |
| `currentStoreId` | String | Last selected store |
| `sidebar-collapsed` | `"true"` / `"false"` | Sidebar state |
| `theme` | JSON `{primaryColor, logoUrl}` | Theme config |
| `printer-name` | String | Paired printer display name |
| `printer-id` | String | Paired printer device ID |
