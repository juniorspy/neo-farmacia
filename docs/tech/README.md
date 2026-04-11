# Technical Documentation

Technical reference for Neo Farmacia. Explains how the system works, what's used, and how everything fits together.

## Table of Contents

1. [Architecture](./01-architecture.md) — System design, data flow, tenant isolation
2. [Tech Stack](./02-stack.md) — Libraries and services used, and why
3. [API Reference](./03-api-reference.md) — All HTTP endpoints, auth, schemas
4. [Data Models](./04-data-models.md) — MongoDB schemas, Odoo entities, Redis keys
5. [Dashboard](./05-dashboard.md) — Frontend architecture, theming, state management
6. [Printing](./06-printing.md) — Bluetooth thermal printer, ESC/POS
7. [Deployment](./07-deployment.md) — Dokploy setup, environment variables
8. [Development](./08-development.md) — Local setup, commands, workflow

## Quick Reference

| | |
|---|---|
| **Repo** | [juniorspy/neo-farmacia](https://github.com/juniorspy/neo-farmacia) |
| **API** | `https://api.leofarmacia.com` |
| **Dashboard** | `https://app.leofarmacia.com` |
| **Odoo** | `https://pos.leofarmacia.com` |
| **Deployment** | Dokploy on VPS (Docker) |
| **Default admin** | `admin@leofarmacia.com` / `admin123` |

## Project Layout

```
neo-farmacia/
├── packages/
│   ├── api/              # Fastify microservice (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── config/       # Environment config loader
│   │   │   ├── shared/       # Clients: MongoDB, Redis, Odoo, logger
│   │   │   ├── modules/      # Feature modules (auth, orders, chats, ...)
│   │   │   ├── app.ts        # Fastify app builder
│   │   │   └── server.ts     # Entry point
│   │   └── Dockerfile
│   └── dashboard/        # Next.js frontend (React + TypeScript)
│       ├── src/
│       │   ├── app/          # Next.js App Router pages
│       │   ├── components/   # UI components (sidebar, header, cards)
│       │   └── lib/          # Clients: api, auth, store, theme, printer
│       └── Dockerfile
└── docs/
    ├── tech/             # This folder
    ├── stages/           # Implementation stages
    ├── sessions/         # Work session logs
    └── architecture/     # High-level architecture docs
```
