# Glossary

Common terms used across the project.

| Term | Meaning |
|---|---|
| **store_id** | Unique identifier for a pharmacy/location. Scopes ALL multi-tenant data. |
| **owner** | Person who owns one or more pharmacies. Logs into the dashboard. |
| **pharmacist** | Role in the system. Can manage their own store(s) only. |
| **admin** | Platform-wide admin. Can see all stores. |
| **chat_id** | WhatsApp conversation identifier. Format: `whatsapp:+18091234567` |
| **instance_name** | Evolution API instance name. Format: `farmacia_{store_slug}` |
| **SSoT** | Single Source of Truth. Odoo is SSoT for inventory. |
| **handover** | Switching a chat between bot and human agent. |
| **debounce** | Grouping multiple fast messages into one before processing. |
| **mutex** | Lock that prevents concurrent processing of the same conversation. |
| **idempotency** | Ensuring the same message is only processed once. |
| **Evolution API** | Self-hosted WhatsApp gateway that provides HTTP API over WhatsApp Web. |
| **n8n** | Open-source workflow automation. Hosts our AI agents. |
| **JSON-RPC** | Protocol used to communicate with Odoo. |
| **Sale Order** | Odoo's model for a customer order (equivalent to "pedido"). |
| **lot** | Batch/lot number for medication tracking in Odoo. |
| **expiry** | Expiration date on a medication lot. |
| **POS** | Point of Sale. The physical system a pharmacy uses at their counter. |
| **POS Sync** | Service that reads from legacy POS databases and updates Odoo. |
| **Dokploy** | Docker deployment platform running on the VPS. |
