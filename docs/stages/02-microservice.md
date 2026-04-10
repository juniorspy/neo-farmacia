# Stage 2: Microservice (The Brain)

**Status**: `in_progress`
**Depends on**: Stage 1 (Odoo)
**Goal**: Fastify API running that handles webhooks, debounce, Odoo proxy, handover, and message logging.

## Why

This is the central nervous system. It receives WhatsApp messages, groups them, checks if bot or human should respond, queries Odoo for products, logs everything, and forwards to n8n for AI processing.

## Deliverables

- [x] Fastify + TypeScript project scaffolded with Docker
- [x] Redis client connected (debounce, mutex, handover, cache)
- [x] MongoDB client connected (message logs, users, sessions)
- [x] Odoo JSON-RPC client (reusable service)
- [x] Webhook endpoint for Evolution API
- [x] Debounce logic (2s window, Redis)
- [x] Idempotency check (message ID dedup)
- [x] Per-conversation mutex (Redis SETNX)
- [x] Message logging to MongoDB (indexed by store_id + remoteJid)
- [x] Forward enriched payload to n8n webhook
- [x] Handover state management (bot | manual) in Redis
- [x] Handover check at ingress AND egress
- [x] Typing indicator sent immediately on message receipt
- [ ] API endpoints for n8n callbacks:
  - [x] `POST /api/v1/products/search` — search Odoo products
  - [x] `POST /api/v1/orders/update` — create/update Sales Order in Odoo
  - [x] `POST /api/v1/users/lookup` — find or create user in MongoDB
- [x] Response endpoint: receive n8n reply → send via Evolution API
- [x] Product search cache in Redis (TTL 5min)
- [x] Retry with exponential backoff for Evolution API calls

## Project Structure

```
packages/api/
├── src/
│   ├── app.ts                    # Fastify bootstrap + plugin registration
│   ├── server.ts                 # Entry point
│   ├── config/
│   │   └── env.ts                # Environment config with validation
│   ├── modules/
│   │   ├── webhook/
│   │   │   ├── webhook.routes.ts
│   │   │   ├── webhook.handler.ts
│   │   │   ├── debounce.service.ts
│   │   │   └── idempotency.service.ts
│   │   ├── handover/
│   │   │   ├── handover.routes.ts
│   │   │   ├── handover.handler.ts
│   │   │   └── handover.service.ts
│   │   ├── odoo/
│   │   │   ├── odoo.routes.ts
│   │   │   ├── odoo.handler.ts
│   │   │   ├── odoo.client.ts        # JSON-RPC client
│   │   │   ├── products.service.ts
│   │   │   └── orders.service.ts
│   │   ├── users/
│   │   │   ├── users.routes.ts
│   │   │   ├── users.handler.ts
│   │   │   └── users.service.ts
│   │   ├── messages/
│   │   │   ├── messages.routes.ts
│   │   │   ├── messages.handler.ts
│   │   │   └── messages.service.ts
│   │   └── evolution/
│   │       ├── evolution.client.ts    # Send messages, typing indicators
│   │       └── evolution.types.ts
│   ├── shared/
│   │   ├── redis.ts
│   │   ├── mongo.ts
│   │   ├── logger.ts                 # Pino
│   │   └── errors.ts                 # Standardized error types
│   └── types/
│       └── index.ts                  # Shared TypeScript types
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Key Patterns

- **Immediate 200 OK** on webhook, async processing after
- **Debounce**: Redis key `debounce:{store_id}:{chat_id}` with 2s TTL. Accumulate message text. On expiry, forward grouped message.
- **Mutex**: Redis `SETNX mutex:{store_id}:{chat_id}` with 30s TTL. Prevents concurrent n8n executions for same conversation.
- **Handover**: Redis key `session:{store_id}:{chat_id}` with value `bot` or `manual`. Check before forwarding to n8n (ingress) and before sending reply (egress).
- **Idempotency**: Redis `SET msg:{message_id} 1 EX 3600 NX`. Skip if already processed.
- **Multi-tenant**: Every MongoDB query MUST include `store_id`. Enforced at data access layer.

## MongoDB Schemas

### messages
```
{
  store_id: string (indexed),
  chat_id: string (indexed),
  message_id: string (unique),
  direction: "inbound" | "outbound",
  text: string,
  sender: "customer" | "bot" | "agent",
  timestamp: Date,
  meta: { phone, pushName, source, instanceName }
}
Index: { store_id: 1, chat_id: 1, timestamp: -1 }
```

### users
```
{
  store_id: string (indexed),
  chat_id: string,
  phone: string,
  name: string,
  address: string,
  created_at: Date,
  updated_at: Date
}
Index: { store_id: 1, chat_id: 1 } (unique)
Index: { store_id: 1, phone: 1 }
```

## Decisions

- Deployed as Docker compose service "api" on Dokploy
- Container: neofarmacia-api-f2s0h8-api-1
- Domain: api.leofarmacia.com (HTTPS via Traefik/Let's Encrypt)
- Connects to MongoDB, Redis, and Odoo via dokploy-network internal hostnames
- Built from GitHub repo packages/api/Dockerfile

## Verified Endpoints

- `GET /health` — returns service status
- `POST /api/v1/products/search` — searches Odoo products (cached in Redis)

## Session References

- [2026-04-10-01](../sessions/2026-04-10-01.md)
