# Data Models

## MongoDB Collections

### stores
Owner/pharmacy configuration.
```
{
  _id: ObjectId,
  store_id: string,              // unique slug-based identifier
  name: string,                  // "Farmacia San Rafael"
  address: string,
  phone: string,
  owner_id: string,              // links to owners collection
  odoo_company_id: number,       // Odoo company ID for this store
  settings: {
    agent_enabled: boolean,      // bot active or paused
    greeting_message: string,
    business_hours: { open: string, close: string },
  },
  created_at: Date,
  updated_at: Date
}
Indexes:
  { store_id: 1 } unique
  { owner_id: 1 }
```

### owners
Platform users who own one or more pharmacies.
```
{
  _id: ObjectId,
  owner_id: string,
  name: string,
  email: string,
  phone: string,
  password_hash: string,        // bcrypt
  role: "admin" | "pharmacist",
  store_ids: [string],          // stores this owner can access
  created_at: Date,
  updated_at: Date
}
Indexes:
  { owner_id: 1 } unique
  { email: 1 } unique
  { phone: 1 } unique
```

### messages
Chat message history.
```
{
  _id: ObjectId,
  store_id: string,
  chat_id: string,               // "whatsapp:+18091234567"
  message_id: string,            // Evolution message ID (for idempotency)
  direction: "inbound" | "outbound",
  text: string,
  sender: "customer" | "bot" | "agent",
  timestamp: Date,
  meta: {
    phone: string,
    pushName: string,
    source: "whatsapp",
    instanceName: string,
    messageType: "text" | "audio" | "image"
  }
}
Indexes:
  { store_id: 1, chat_id: 1, timestamp: -1 }
  { message_id: 1 } unique
  { store_id: 1, timestamp: -1 }   // for recent messages across store
TTL index: { timestamp: 1 }, expireAfterSeconds: 7776000  // 90 days
```

### users (customers)
WhatsApp customers per store.
```
{
  _id: ObjectId,
  store_id: string,
  chat_id: string,
  phone: string,
  name: string,
  address: string,
  registered: boolean,          // completed registration flow
  created_at: Date,
  updated_at: Date
}
Indexes:
  { store_id: 1, chat_id: 1 } unique
  { store_id: 1, phone: 1 }
```

### orders (local copy for dashboard/reporting)
Mirror of Odoo Sale Orders for fast dashboard queries.
```
{
  _id: ObjectId,
  store_id: string,
  odoo_order_id: number,         // Odoo sale.order ID
  order_number: string,          // "SO001"
  chat_id: string,
  customer: {
    name: string,
    phone: string,
    address: string
  },
  items: [{
    odoo_product_id: number,
    name: string,
    quantity: number,
    unit_price: number,
    subtotal: number,
    lot: string,
    expiry: Date
  }],
  totals: {
    subtotal: number,
    tax: number,
    total: number
  },
  status: "draft" | "confirmed" | "dispatched" | "cancelled",
  handled_by: "bot" | "agent",
  created_at: Date,
  updated_at: Date,
  dispatched_at: Date
}
Indexes:
  { store_id: 1, status: 1, created_at: -1 }
  { store_id: 1, chat_id: 1 }
  { odoo_order_id: 1 } unique
```

### whatsapp_numbers
Connected WhatsApp numbers per store.
```
{
  _id: ObjectId,
  store_id: string,
  instance_name: string,         // Evolution instance name
  api_key: string,               // Evolution instance API key
  phone: string,
  display_name: string,
  is_default: boolean,
  status: "pending" | "connected" | "disconnected",
  qr_code: string,               // base64 (temporary)
  connected_at: Date,
  created_at: Date
}
Indexes:
  { store_id: 1 }
  { instance_name: 1 } unique
```

## Redis Key Patterns

```
debounce:{store_id}:{chat_id}         → accumulated message text (TTL 2s)
mutex:{store_id}:{chat_id}            → "locked" (TTL 30s, SETNX)
session:{store_id}:{chat_id}          → "bot" | "manual" (no TTL)
idempotent:{message_id}               → "1" (TTL 1h)
cache:products:{store_id}:{query}     → JSON product results (TTL 5min)
chat_instance:{store_id}:{chat_id}    → instance_name (TTL 24h)
rate:{store_id}:{chat_id}             → request count (TTL 1min)
```

## Odoo Models (reference)

| Odoo Model | Purpose |
|---|---|
| `res.company` | Store/pharmacy (multi-company) |
| `res.partner` | Customers and contacts |
| `product.template` | Product templates |
| `product.product` | Product variants |
| `stock.quant` | Stock quantities per location/lot |
| `stock.lot` | Lot numbers with expiry dates |
| `sale.order` | Sale orders (header) |
| `sale.order.line` | Sale order lines (items) |
| `product.category` | Product categories (OTC, Prescription, etc.) |
