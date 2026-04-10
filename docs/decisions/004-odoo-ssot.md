# ADR-004: Odoo as Single Source of Truth for Inventory

**Date**: 2026-04-09
**Status**: accepted

## Context
Pharmacies need lot tracking, expiry dates, and proper sales accounting. Odoo 17 provides all of this out of the box with its Inventory and Sales modules.

## Decision
Odoo 17 is the SSoT for all inventory data (products, stock, lots, expiry, prices) and sales (Sale Orders). The microservice queries Odoo via JSON-RPC and caches results in Redis.

## Consequences
- **Positive**: Full ERP capabilities — accounting, lot tracking, expiry management, multi-company.
- **Positive**: POS legacy sync writes to Odoo, maintaining one source of truth.
- **Negative**: JSON-RPC can be slow. Mitigated with Redis cache (5min TTL).
- **Negative**: Odoo has a learning curve for configuration.
- **Negative**: Odoo can deadlock under concurrent writes. Must limit concurrent order creation.
