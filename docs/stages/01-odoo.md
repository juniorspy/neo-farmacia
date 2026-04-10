# Stage 1: Odoo (The Foundation)

**Status**: `pending`
**Goal**: Have Odoo 17 running with pharmacy inventory configured, accessible via JSON-RPC from Node.js.

## Why First

Without inventory there is nothing to sell. Odoo is the single source of truth for products, lots, expiry dates, and prices. Everything else depends on this.

## Deliverables

- [ ] Odoo 17 + PostgreSQL running in Docker/Dokploy
- [ ] Pharmacy modules enabled: Inventory, Sales, Contacts
- [ ] Lot tracking and expiry date tracking enabled
- [ ] Test pharmacy created with sample products (medications)
- [ ] Multi-company/multi-store structure configured
- [ ] JSON-RPC connection validated from a Node.js script
- [ ] Basic CRUD operations working: search products, read stock, create sale order

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

_(Record any decisions made during this stage)_

## Blockers

_(Record any blockers encountered)_

## Session References

_(Link to session logs where work on this stage was done)_
