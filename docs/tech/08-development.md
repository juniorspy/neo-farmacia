# Development

How to work on Neo Farmacia locally.

## Prerequisites

- Node.js 22+
- npm 10+
- Docker (for local MongoDB/Redis, optional)
- Git
- Chrome or Edge (for testing Bluetooth printer features)

## First-time setup

```bash
git clone https://github.com/juniorspy/neo-farmacia.git
cd neo-farmacia

# Install API dependencies
cd packages/api
npm install

# Install Dashboard dependencies
cd ../dashboard
npm install
```

## Running the API locally

The API needs MongoDB, Redis, and an Odoo instance to function fully. Two options:

### Option 1: Point at the production services
Edit `packages/api/.env` (create it):
```
NODE_ENV=development
PORT=3000
MONGODB_URI=<connection-string-to-remote-mongo>
REDIS_URL=<redis-url>
ODOO_URL=https://pos.leofarmacia.com
ODOO_DB=odoo
ODOO_USER=admin
ODOO_PASSWORD=admin
JWT_SECRET=dev-secret
```

Then:
```bash
cd packages/api
npm run dev
```

### Option 2: Run everything locally
Start MongoDB and Redis in Docker:
```bash
docker run -d --name mongo -p 27017:27017 mongo:7
docker run -d --name redis -p 6379:6379 redis:7
```

Point Odoo at a local instance or live. The rest of the env stays default.

## Running the Dashboard locally

```bash
cd packages/dashboard
npm run dev
```

By default it talks to `http://localhost:3001`. Override with:

```bash
# packages/dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
# or
NEXT_PUBLIC_API_URL=https://api.leofarmacia.com
```

Open `http://localhost:3000`. Use the **[Dev] Entrar sin autenticación** button on the login page to skip auth while developing.

## Development workflow

1. Create a feature branch (or work on `main` if it's small)
2. Make changes in `packages/api` and/or `packages/dashboard`
3. Type check: `npx tsc --noEmit` (API) or `npx next build` (dashboard)
4. Commit with a clear message, **no Co-Authored-By lines**
5. Push to `main`
6. Dokploy auto-deploys in ~1-2 minutes
7. Verify at `api.leofarmacia.com` / `app.leofarmacia.com`

## Useful commands

### API
```bash
cd packages/api

npm run dev               # Start with hot reload (tsx watch)
npm run build             # Compile TypeScript → dist/
npx tsc --noEmit          # Type check without emitting
node dist/server.js       # Run compiled
```

### Dashboard
```bash
cd packages/dashboard

npm run dev               # Next.js dev server
npm run build             # Production build (standalone)
npm run start             # Run production build
```

### Full build for deploy check
```bash
# API
cd packages/api && npm run build

# Dashboard
cd packages/dashboard && npx next build
```

## Adding a new API endpoint

1. Create `packages/api/src/modules/{feature}/{feature}.routes.ts`
2. Export `async function {feature}Routes(app: FastifyInstance, opts: ...)`
3. Use `app.addHook('preHandler', app.authenticate)` if the whole module needs auth
4. Register it in `packages/api/src/app.ts`:
   ```ts
   await app.register(async (instance) => {
     await featureRoutes(instance, { redis, config });
   });
   ```
5. `npx tsc --noEmit` to verify
6. Commit and push

See existing modules like `orders`, `products`, `chats` for the pattern.

## Adding a new dashboard page

1. Create `packages/dashboard/src/app/(dashboard)/{route}/page.tsx`
2. Make it a client component (`"use client"`)
3. Use `useStore()` to get the current store, `api` for HTTP calls
4. Add a nav entry in `components/sidebar.tsx`
5. `npx next build` to verify
6. Commit and push

## Debugging

### API
Logs go to stdout via pino. In Dokploy, see the **Logs** tab. Locally, pino-pretty formats them colorfully.

### Dashboard
Use browser DevTools (Network, Console). All API calls are visible in Network. JWT is attached as `Authorization` header.

## Database inspection

### MongoDB
```bash
# Connect from host
mongosh "mongodb://localhost:27017/neo_farmacia"

> show collections
> db.admins.find()
> db.messages.find({ store_id: "store_leo" }).sort({ timestamp: -1 }).limit(10)
```

### Redis
```bash
redis-cli

> KEYS *
> GET session:store_leo:chat_123
> TTL debounce:store_leo:chat_123
```

### Odoo
Use the Odoo web UI at `https://pos.leofarmacia.com` — login as admin. For raw queries, use the JSON-RPC helper in `packages/api/src/shared/odoo.ts`.

## Tests

There are no automated tests yet. When adding critical business logic (pricing, order totals, permissions), write a test first.

Recommended setup for later:
- **API**: Vitest + Fastify inject() for route tests
- **Dashboard**: Vitest + React Testing Library

## Code style

- TypeScript strict mode on both packages
- No `any` unless absolutely necessary
- Async/await everywhere (no raw promises)
- Error handling: `try/catch` at route level, throw inside services
- Small files, one concept each
- No unnecessary abstractions — write the code you need, refactor when patterns emerge
