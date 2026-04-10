# API Documentation

Endpoint documentation for the Fastify microservice. Updated as endpoints are implemented.

## Base URL

Development: `http://localhost:3000`
Production: `https://api.{domain}`

## Authentication

All dashboard endpoints require JWT Bearer token.
n8n-facing endpoints use a shared API key.

```
Authorization: Bearer {jwt_token}       # Dashboard routes
X-API-Key: {api_key}                    # n8n callback routes
```

## Endpoint Groups

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Service health check |

### Webhook (Evolution API → Microservice)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhook/evolution` | none | Receive WhatsApp events |

### n8n Callbacks (n8n → Microservice)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/products/search` | API key | Search products in Odoo |
| POST | `/api/v1/orders/update` | API key | Create/update Sale Order in Odoo |
| GET | `/api/v1/orders/:order_id` | API key | Get order status |
| POST | `/api/v1/users/lookup` | API key | Find or create user |

### Dashboard — Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/login` | none | Login → JWT |
| GET | `/api/v1/auth/validate` | JWT | Validate token |
| POST | `/api/v1/auth/refresh` | JWT | Refresh token |

### Dashboard — Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/stores/:store_id/orders` | JWT | List orders |
| GET | `/api/v1/stores/:store_id/orders/:id` | JWT | Order detail |
| PATCH | `/api/v1/stores/:store_id/orders/:id/status` | JWT | Update status |
| PATCH | `/api/v1/stores/:store_id/orders/:id/items/:item_id` | JWT | Edit item |

### Dashboard — Chats
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/stores/:store_id/chats` | JWT | Active chats |
| GET | `/api/v1/stores/:store_id/chats/:chat_id/messages` | JWT | Chat history |
| POST | `/api/v1/stores/:store_id/chats/:chat_id/messages` | JWT | Send manual message |
| PUT | `/api/v1/stores/:store_id/chats/:chat_id/mode` | JWT | Toggle bot/manual |

### Dashboard — WhatsApp
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/stores/:store_id/whatsapp/numbers/connect` | JWT | Add number |
| GET | `/api/v1/stores/:store_id/whatsapp/numbers` | JWT | List numbers |
| GET | `/api/v1/stores/:store_id/whatsapp/numbers/:id/status` | JWT | Number status + QR |
| DELETE | `/api/v1/stores/:store_id/whatsapp/numbers/:id` | JWT | Disconnect |
| PUT | `/api/v1/stores/:store_id/whatsapp/numbers/default` | JWT | Set default |

### Dashboard — Products
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/stores/:store_id/products` | JWT | List from Odoo |
| GET | `/api/v1/stores/:store_id/products/:id` | JWT | Detail + lots |
| POST | `/api/v1/stores/:store_id/products` | JWT | Create in Odoo |
| PUT | `/api/v1/stores/:store_id/products/:id` | JWT | Update in Odoo |

### Dashboard — Customers
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/stores/:store_id/customers` | JWT | List customers |
| GET | `/api/v1/stores/:store_id/customers/:id` | JWT | Customer detail |

### Dashboard — Multi-store
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/owners/:owner_id/stores` | JWT | List owner's stores |

### Dashboard — Stats
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/stores/:store_id/stats/summary` | JWT | Today's numbers |
| GET | `/api/v1/stores/:store_id/stats/sales` | JWT | Sales by period |
| GET | `/api/v1/stores/:store_id/stats/products` | JWT | Top products |
| GET | `/api/v1/stores/:store_id/stats/agent` | JWT | Bot vs human |

### WebSocket
| Event | Direction | Description |
|---|---|---|
| `new_order` | server→client | New order created |
| `order_updated` | server→client | Order status changed |
| `new_message` | server→client | New chat message |
| `handover_changed` | server→client | Bot/manual mode changed |

Connection: `ws://{host}/ws?store_id={store_id}&token={jwt}`

---

Detailed request/response schemas will be added as endpoints are implemented.
