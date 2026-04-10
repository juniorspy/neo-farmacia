# Stage 4: WhatsApp (The Channel)

**Status**: `pending`
**Depends on**: Stage 2 (Microservice) + Stage 3 (n8n Agents)
**Goal**: Full WhatsApp flow working end-to-end — message in, AI processes, reply out.

## Why

This is where the product becomes real. A customer sends a WhatsApp message and gets an intelligent response about pharmacy products.

## Deliverables

- [ ] Evolution API instance configured for pharmacy
- [ ] Test WhatsApp number connected via QR
- [ ] Webhook configured: Evolution → Microservice
- [ ] End-to-end flow tested:
  - Customer sends "hola" → gets greeting
  - Customer asks for "paracetamol" → agent searches Odoo → responds with options
  - Customer orders → cart agent creates Sale Order in Odoo
  - Customer confirms → order finalized
- [ ] Multi-number support: connect second number to same pharmacy
- [ ] Instance-to-store routing working (instance name → store_id)

## Tasks

### 4.1 Evolution API Setup
- Create instance: `POST /instance/create` on Evolution API
- Instance naming: `farmacia_{store_slug}`
- Configure webhook URL: `https://{microservice}/webhook/evolution`
- Webhook events: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`

### 4.2 Connect Test Number
- Generate QR code from Evolution API
- Scan with test phone
- Verify connection state polling

### 4.3 End-to-End Testing
- Send message from test phone
- Verify: Evolution → Microservice (webhook received)
- Verify: Debounce works (send 3 fast messages, grouped into 1)
- Verify: Message logged in MongoDB
- Verify: Forwarded to n8n
- Verify: n8n processes and calls back microservice
- Verify: Response sent via Evolution to WhatsApp
- Verify: Response logged in MongoDB

### 4.4 Multi-Number
- Connect second number to same store
- Verify routing: both numbers route to same store_id
- Verify responses go back through correct instance
- Chat-to-instance mapping in Redis

## Technical Notes

- Evolution API base URL: configured per deployment
- Instance name extraction: `farmacia_mi_farmacia` → slug `mi_farmacia` → lookup store_id
- Slug-to-store mapping stored in MongoDB or Redis

## Decisions

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
