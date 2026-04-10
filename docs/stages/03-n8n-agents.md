# Stage 3: n8n Agents (The Intelligence)

**Status**: `pending`
**Depends on**: Stage 2 (Microservice)
**Goal**: 5 AI agents running in n8n that handle pharmacy conversations via the microservice API.

## Why

n8n provides visual, flexible AI orchestration. The agents handle the conversational complexity — intent classification, product search, cart management, and user registration — without requiring code deploys to change prompts or logic.

## Deliverables

- [ ] n8n instance configured in Docker/Dokploy (or reuse existing)
- [ ] Main workflow: webhook entry point
- [ ] Intention Agent adapted for pharmacy context
- [ ] Dialogue Agent using microservice `/products/search` instead of Meilisearch
- [ ] Cart Agent using microservice `/orders/update` instead of Firebase acceptCommand
- [ ] Registration Agent adapted for pharmacy clients (name, address, phone)
- [ ] Fallback Agent for unclassified messages
- [ ] End-to-end test: n8n receives message → classifies → searches → responds

## Agents (adapted from neo colmado)

### 3.1 Intention Agent
Classifies incoming messages into categories:
- `[saludo]` — Greetings
- `[buscar_producto]` — Product search / order request
- `[consultar_precio]` — Price inquiry
- `[consultar_disponibilidad]` — Stock/availability check
- `[modificar_carrito]` — Cart changes
- `[finalizar_orden]` — Complete order
- `[estado_pedido]` — Order status
- `[consulta_farmacia]` — Pharmacy-specific (hours, location, etc.)
- `[desambiguar]` — Unclear message needing context

**Pharmacy additions vs colmado**:
- Medication-specific intents (dosage questions, alternatives)
- Prescription-related queries

### 3.2 Dialogue Agent
Main conversation handler:
- Receives classified intent + user message
- Calls `POST /api/v1/products/search` on microservice to find medications in Odoo
- Responds with product info, prices, availability
- Emits `[Tool: ...]` instructions for cart operations

**Key change**: Calls microservice instead of Meilisearch directly.

### 3.3 Cart Agent
Processes cart operations from Dialogue Agent:
- `agregar` — Add medication to cart
- `actualizar` — Change quantity
- `remover` — Remove from cart
- `consultar_precio` — Check price
- `orden_completada` — Finalize order

**Key change**: Calls `POST /api/v1/orders/update` on microservice which writes to Odoo Sales Order instead of Firebase.

### 3.4 Registration Agent
Collects new customer data:
- Name (required)
- Phone (from WhatsApp, auto-detected)
- Address (optional for pharmacy, may need for delivery)

**Key change**: Calls `POST /api/v1/users/lookup` to create user in MongoDB.

### 3.5 Fallback Agent
Handles unclassified messages with a generic helpful response.

## Workflow Structure

```
Webhook (from microservice)
  → User lookup (via microservice API)
  → New user? → Registration Agent
  → Existing user → Intention Agent
      → Route by intent:
          → [buscar_producto] → Dialogue Agent → Cart Agent
          → [modificar_carrito] → Dialogue Agent → Cart Agent
          → [finalizar_orden] → Mark order complete
          → [saludo] → Direct response
          → [other] → Fallback Agent
  → Response sent back to microservice webhook
```

## Integration Points

| n8n calls | Microservice endpoint |
|---|---|
| Search products | `POST /api/v1/products/search` |
| Create/update order | `POST /api/v1/orders/update` |
| Lookup user | `POST /api/v1/users/lookup` |
| Get order status | `GET /api/v1/orders/:id` |

## Decisions

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
