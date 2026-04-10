# Stage 1: Odoo (The Foundation)

**Status**: `done`
**Goal**: Have Odoo 17 running with pharmacy inventory configured, accessible via JSON-RPC from Node.js.

## Why First

Without inventory there is nothing to sell. Odoo is the single source of truth for products, lots, expiry dates, and prices. Everything else depends on this.

## Deliverables

- [x] Odoo 17 + PostgreSQL running in Docker/Dokploy
- [x] Pharmacy modules enabled: Inventory, Sales, Contacts
- [x] Lot tracking and expiry date tracking enabled
- [x] Test pharmacy created with 20 sample products (medications, supplements, personal care)
- [ ] Multi-company/multi-store structure configured (deferred — will set up per tenant)
- [x] JSON-RPC connection validated from a Node.js script
- [x] Basic CRUD operations working: search products, read stock, create categories

## Tasks

### 1.1 Install Odoo
- Docker image: `odoo:17`
- PostgreSQL: `postgres:16`
- Persistent volumes for data and addons
- Reverse proxy config in Dokploy

### 1.2 Configure Modules
- Enable: Inventory (`stock`), Sales (`sale`), Contacts (`contacts`)
- Enable lot tracking (`tracking = 'lot'`) on product template
- Enable expiry dates on lots (`use_expiration_date`)
- Configure product categories for medications

### 1.3 Sample Data
- Create a test pharmacy (company)
- Create product categories: OTC, Prescription, Controlled
- Create 10-20 sample products with:
  - Name, price, barcode
  - Lot numbers
  - Expiry dates
  - Stock quantities

### 1.4 JSON-RPC Validation
- Write a standalone Node.js script (`scripts/test-odoo.ts`)
- Authenticate via JSON-RPC
- Search products by name (partial match)
- Read product details (stock, lots, expiry)
- Create a draft Sales Order
- Confirm the Sales Order

## Technical Notes

- Odoo JSON-RPC endpoint: `http://odoo:8069/jsonrpc`
- Authentication returns a `uid` used for subsequent calls
- Key models:
  - `product.product` — products with variants
  - `product.template` — product templates
  - `stock.quant` — stock quantities per location/lot
  - `stock.lot` — lot numbers with expiry
  - `sale.order` / `sale.order.line` — sales orders
  - `res.partner` — customers/contacts

## Decisions

- Odoo deployed via Dokploy compose service (not standalone Docker)
- Service name in Dokploy: `pos` (compose name: `neofarmacia-pos-823krk`)
- Domain: `pos.leofarmacia.com` (HTTPS via Let's Encrypt + Traefik)
- Containers: `neofarmacia-pos-823krk-odoo-1` (Odoo) + `neofarmacia-pos-823krk-odoo-db-1` (PostgreSQL)
- Odoo credentials: admin / admin (change in production)
- Required Traefik labels in compose for routing
- Required `dokploy-network` (external) + `internal` (bridge) network setup
- Database initialized with `odoo -i base --stop-after-init`

## Blockers

- SSL shows "not secure" due to mixed content — needs `proxy_mode = True` in Odoo config (pending fix)

## Session References

- [2026-04-09-01](../sessions/2026-04-09-01.md) — Architecture and planning
- [2026-04-10-01](../sessions/2026-04-10-01.md) — Dokploy install + Odoo deployment
