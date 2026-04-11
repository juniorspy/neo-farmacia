# Tech Stack

Libraries and services used, and the reason for each choice.

## Backend (`packages/api`)

| Layer | Library | Why |
|---|---|---|
| **Runtime** | Node.js 22 (Alpine) | LTS, small Docker image |
| **Language** | TypeScript 5 | Type safety, better refactoring |
| **HTTP framework** | Fastify 5 | Faster than Express, better async ergonomics, built-in JSON schema |
| **Auth** | @fastify/jwt | Official Fastify plugin, HS256 tokens |
| **Password hashing** | bcrypt | Industry standard, slow by design |
| **Database (docs)** | mongoose 9 | ODM for MongoDB, schema validation |
| **Database (cache)** | ioredis 5 | Actively maintained Redis client, better than node-redis |
| **Odoo client** | axios (JSON-RPC) | Odoo has no Node SDK; raw JSON-RPC is simple |
| **Logger** | pino 10 | Fastest Node logger, pretty output in dev |
| **CORS** | @fastify/cors | Official Fastify plugin |

### Why Fastify over Express
- Lower latency, higher throughput benchmarks
- Async/await first-class
- JSON schema validation built-in
- Plugin system is more structured

### Why not Prisma for MongoDB
Mongoose was already in place and has better flexibility for aggregation pipelines (used in chat list queries). Prisma's MongoDB support is still maturing.

## Frontend (`packages/dashboard`)

| Layer | Library | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Server components, built-in routing, standalone output for Docker |
| **Language** | TypeScript 5 | Matches backend |
| **Styling** | Tailwind CSS 4 | Utility-first, small bundle |
| **Icons** | lucide-react | Tree-shakeable, 1000+ icons, consistent style |
| **Classname util** | clsx | Tiny, composable conditional classes |

### Why Next.js and not plain React
- File-system routing (less config)
- Standalone Docker build (small image)
- Server components option (future: can move data fetching server-side)

### Why Tailwind
- No CSS file explosion
- Theme via CSS custom properties (for the dynamic primary color)
- Class auto-completion in IDEs

### Why no Redux / Zustand
The app uses React Context for auth, store selector, and theme — simple enough, no global state library needed. Pages do their own fetching with `useEffect`.

## Infrastructure

| Service | Role |
|---|---|
| **Dokploy** | Deployment platform on the VPS. Auto-deploys from GitHub on push. |
| **Docker** | Container runtime (all services run in containers) |
| **Traefik** | Reverse proxy (bundled with Dokploy), handles TLS |
| **Let's Encrypt** | TLS certificates, auto-renewed by Traefik |
| **GitHub** | Source of truth for code, webhook triggers Dokploy builds |

## External Services

| Service | Role |
|---|---|
| **Odoo 17** | Inventory ERP. Single source of truth for products, stock, sales. |
| **MongoDB** | Chat history, users, admin accounts |
| **Redis** | Cache, debounce, mutex, session state |
| **Evolution API** | WhatsApp gateway (Baileys under the hood) |
| **n8n** | AI agent workflow engine (5 agents for sales conversation) |

## Browser APIs used

| API | Where | Purpose |
|---|---|---|
| **Web Bluetooth** | Dashboard settings + orders | Pair and print to Bluetooth thermal printers |
| **localStorage** | Dashboard | JWT token, theme config, printer pairing, sidebar collapsed state |
| **FileReader** | Dashboard settings | Logo upload (base64 encoded) |

## Why no monorepo tool (Turborepo / Nx)
Only two packages right now, and they're deployed independently. Adding Turborepo would be overkill. If we add a third package (shared types?), we'll reconsider.
