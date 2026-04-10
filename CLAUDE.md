# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Neo Farmacia** is a multi-tenant SaaS platform for pharmacies. It automates sales via WhatsApp using AI agents and provides a web dashboard for pharmacy owners to manage orders, chats, inventory, and multiple locations.

## Core Concept

WhatsApp AI agent sells pharmacy products (sourced from Odoo/POS) → orders appear in a web dashboard → pharmacist prints and dispatches.

## Stack

| Layer | Technology |
|---|---|
| Backend API + Webhook Engine | Fastify (Node.js + TypeScript) |
| AI Conversational Logic | n8n (5 agents: intention, dialogue, cart, registration, fallback) |
| Inventory & Sales (SSoT) | Odoo 17 (PostgreSQL, JSON-RPC) |
| Chat History & Users | MongoDB |
| State & Cache | Redis (debounce, mutex, handover, rate limit, product cache) |
| WhatsApp Gateway | Evolution API |
| Frontend Dashboard | Next.js (React) |
| Deploy | Docker / Dokploy on VPS (min 16GB RAM) |

## Architecture

```
WhatsApp → Evolution API → Microservice (Fastify)
                              ├── Debounce (Redis)
                              ├── Mutex per conversation (Redis SETNX)
                              ├── Handover check ingress + egress (Redis)
                              ├── Idempotency (message ID)
                              ├── Log to MongoDB
                              └── Forward to n8n → AI Agents
                                    ↓ callbacks
                              n8n → Microservice API:
                                    POST /api/v1/products/search → Odoo
                                    POST /api/v1/orders/update   → Odoo
                                    POST /api/v1/users/lookup    → MongoDB
                                    ↓
                              Microservice → Evolution API (reply)

Dashboard (Next.js) ←WebSocket→ Microservice ←→ MongoDB/Redis/Odoo
```

## Critical Rules

- **Isolation**: Everything carries a `store_id`. No cross-tenant data leakage.
- **No Firebase**: This project is independent from neo colmado. Use MongoDB + Redis + Odoo only.
- **n8n for AI**: All conversational logic lives in n8n. The microservice is the bridge.
- **Odoo is SSoT**: Odoo is always the source of truth for inventory (lots, expiry, prices).

## Project Structure

```
neo_farmacia/
├── docs/                    # Project documentation
│   ├── architecture/        # System design docs
│   ├── stages/              # Stage-by-stage implementation specs
│   ├── api/                 # API endpoint documentation
│   ├── decisions/           # Architecture Decision Records (ADRs)
│   └── sessions/            # Session work logs
├── packages/
│   ├── api/                 # Fastify microservice (TypeScript)
│   │   ├── src/
│   │   │   ├── modules/     # Feature modules
│   │   │   ├── shared/      # Shared clients (redis, mongo, odoo)
│   │   │   └── app.ts       # Fastify bootstrap
│   │   ├── Dockerfile
│   │   └── package.json
│   └── dashboard/           # Next.js frontend
│       ├── src/
│       ├── Dockerfile
│       └── package.json
├── docker-compose.yml       # Full stack orchestration
├── .env.example             # Environment variables template
└── CLAUDE.md                # This file
```

## Build Commands

```bash
# Start all services (dev)
docker-compose up -d

# API only
cd packages/api && npm run dev

# Dashboard only
cd packages/dashboard && npm run dev

# Build for production
docker-compose -f docker-compose.prod.yml build
```

## Documentation

- **Roadmap**: docs/ROADMAP.md
- **Architecture**: docs/architecture/
- **Stage specs**: docs/stages/ (each stage has its own spec file)
- **Decisions**: docs/decisions/ (ADR format)
- **Session logs**: docs/sessions/ (what was done each session)

## Related Projects (reference only, no shared code)

- Neo Colmado app: `C:\Users\junio\StudioProjects\conecta2`
- WhatsApp service: `C:\Users\junio\StudioProjects\whatsapp-service`
- Neo Colmado backend: `C:\Users\junio\OneDrive\Documentos\proyects\neo_colmado\backend-neocolmado`
- n8n workflow template: `C:\Users\junio\Downloads\main template_001.json`
