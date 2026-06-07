/**
 * Smoke test: build the Fastify app without touching Mongo/Redis/Odoo and
 * assert the OpenAPI spec is served. Catches route conflicts and plugin
 * registration errors that tsc cannot see (e.g. FST_ERR_DUPLICATED_ROUTE).
 *
 *   npx tsx scripts/smoke-boot.ts
 */
import Redis from 'ioredis';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const redis = new Redis('redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 0 });
const app = await buildApp(redis, loadConfig());
await app.ready();

const res = await app.inject({ method: 'GET', url: '/docs/json' });
if (res.statusCode !== 200) throw new Error(`/docs/json -> ${res.statusCode}`);
const spec = res.json() as { paths: Record<string, Record<string, { tags?: string[] }>> };

const routes = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({
    method: method.toUpperCase(),
    path,
    tag: (op as { tags?: string[] }).tags?.[0],
    documented: Boolean((op as { summary?: string }).summary),
  })),
);
const byTag = new Map<string, number>();
for (const r of routes) byTag.set(r.tag || 'Otros', (byTag.get(r.tag || 'Otros') || 0) + 1);

const devLeaks = routes.filter((r) => r.path.includes('/dev/'));
if (devLeaks.length > 0) {
  throw new Error(`rutas dev expuestas en /docs: ${devLeaks.map((r) => r.path).join(', ')}`);
}

const undocumented = routes.filter((r) => !r.documented);
console.log(`OK — boot limpio, ${routes.length} endpoints en /docs (dev ocultas):`);
for (const [tag, count] of [...byTag.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${tag}`);
}
console.log(
  `Documentación: ${routes.length - undocumented.length}/${routes.length} rutas con summary`,
);
if (undocumented.length > 0) {
  console.log('Sin documentar:');
  for (const r of undocumented) console.log(`  ${r.method} ${r.path}`);
}

await app.close();
redis.disconnect();
