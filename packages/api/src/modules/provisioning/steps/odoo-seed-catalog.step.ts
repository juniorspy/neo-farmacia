import type { ProvisioningStep, StepContext } from '../step.types.js';
import type { ScopedOdoo } from '../../../shared/odoo-scoped.js';
import { getScopedOdoo } from '../../../shared/odoo-scoped-cache.js';
import { logger } from '../../../shared/logger.js';

/**
 * Seed the master catalog into a freshly created pharmacy DB (Stage 10, D2).
 *
 * In farmacia the catalog model is the inverse of colmado: the pharmacy gets
 * a complete catalog from day one and only adjusts prices. For the MVP the
 * source is our own master catalog (MASTER_CATALOG_DB, default: the main
 * ODOO_DB); post-MVP the POS connector (ADR-007) replaces this as the feed —
 * same internal engine, different source.
 *
 * Copies via JSON-RPC (not Odoo db.duplicate) so no template DB has to be
 * maintained and no operational data (orders/customers) leaks across tenants.
 * Idempotent: re-runs skip products already present (by default_code/name).
 *
 * Runs as the internal service user created by odoo_seed_admin — this step
 * doubles as the first live verification of that credential.
 */

const PRODUCT_FIELDS = [
  'name',
  'default_code',
  'list_price',
  'standard_price',
  'barcode',
  'description_sale',
  'categ_id',
];
const BATCH_SIZE = 250;
const MODULE_INSTALL_TIMEOUT_MS = 600000; // sale_management install is slow on a bare DB
const BATCH_CREATE_TIMEOUT_MS = 300000;

/** db.create_database leaves a bare DB (base module only) — product/sale
 *  models don't exist yet. sale_management pulls in product + sale; stock is
 *  needed too: qty_available (read by catalog-sync, product search and
 *  consultarPrecio) only exists with Inventory installed, and lots/expiry +
 *  the future POS connector (ADR-007) live there as well. */
const REQUIRED_MODULES = ['sale_management', 'stock'];

async function ensureModules(target: ScopedOdoo): Promise<string[]> {
  const mods = (await target.execute(
    'ir.module.module',
    'search_read',
    [[['name', 'in', REQUIRED_MODULES]]],
    { fields: ['id', 'name', 'state'] },
  )) as Array<{ id: number; name: string; state: string }>;

  const found = new Set(mods.map((m) => m.name));
  const missing = REQUIRED_MODULES.filter((n) => !found.has(n));
  if (missing.length) throw new Error(`Modules not found in target DB: ${missing.join(', ')}`);

  const toInstall = mods.filter((m) => m.state !== 'installed');
  if (toInstall.length === 0) return [];
  await target.execute(
    'ir.module.module',
    'button_immediate_install',
    [toInstall.map((m) => m.id)],
    {},
    MODULE_INSTALL_TIMEOUT_MS,
  );
  return toInstall.map((m) => m.name);
}

/** Copy categories by name (hierarchy deliberately flattened for the MVP).
 *  Returns source categ_id → target categ_id. */
async function copyCategories(
  source: ScopedOdoo,
  target: ScopedOdoo,
): Promise<{ map: Map<number, number>; created: number }> {
  const srcCats = (await source.execute('product.category', 'search_read', [[]], {
    fields: ['id', 'name'],
  })) as Array<{ id: number; name: string }>;
  const tgtCats = (await target.execute('product.category', 'search_read', [[]], {
    fields: ['id', 'name'],
  })) as Array<{ id: number; name: string }>;

  const tgtByName = new Map(tgtCats.map((c) => [c.name.toLowerCase(), c.id]));
  const map = new Map<number, number>();
  let created = 0;

  for (const cat of srcCats) {
    let tgtId = tgtByName.get(cat.name.toLowerCase());
    if (!tgtId) {
      tgtId = (await target.execute('product.category', 'create', [{ name: cat.name }])) as number;
      tgtByName.set(cat.name.toLowerCase(), tgtId);
      created++;
    }
    map.set(cat.id, tgtId);
  }
  return { map, created };
}

export const odooSeedCatalogStep: ProvisioningStep = {
  name: 'odoo_seed_catalog',
  async run(ctx: StepContext): Promise<void> {
    const { config, store, step } = ctx;
    const masterDb = config.odoo.masterCatalogDb || config.odoo.db;

    if (store.odoo_db === masterDb) {
      logger.info({ db: store.odoo_db }, 'Store uses the master catalog DB itself, skipping seed');
      step.data = { skipped: true, reason: 'store db is the master db' };
      return;
    }

    const source = getScopedOdoo(config, masterDb);
    const target = getScopedOdoo(config, store.odoo_db);

    const modulesInstalled = await ensureModules(target);
    if (modulesInstalled.length) {
      logger.info({ db: store.odoo_db, modules: modulesInstalled }, 'Odoo modules installed');
    }

    const { map: catMap, created: categoriesCreated } = await copyCategories(source, target);

    const products = (await source.execute(
      'product.product',
      'search_read',
      [[['sale_ok', '=', true]]],
      { fields: PRODUCT_FIELDS, limit: 10000 },
    )) as Array<Record<string, unknown>>;

    if (products.length === 0) {
      logger.warn({ masterDb }, 'Master catalog has no saleable products — seeding nothing');
    }

    // Idempotency: skip anything already in the target (retry-safe).
    const existing = (await target.execute('product.product', 'search_read', [[]], {
      fields: ['default_code', 'name', 'barcode'],
      limit: 20000,
      context: { active_test: false },
    })) as Array<Record<string, unknown>>;
    const existingKeys = new Set(
      existing.map((p) => String(p.default_code || p.name || '').toLowerCase()),
    );
    const seenBarcodes = new Set(existing.map((p) => p.barcode).filter(Boolean) as string[]);

    const vals: Array<Record<string, unknown>> = [];
    let skipped = 0;
    for (const p of products) {
      const key = String(p.default_code || p.name || '').toLowerCase();
      if (!key || existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);

      // Barcodes are unique in Odoo — drop duplicates rather than fail the batch.
      let barcode: string | false = (p.barcode as string) || false;
      if (barcode) {
        if (seenBarcodes.has(barcode)) barcode = false;
        else seenBarcodes.add(barcode);
      }

      const srcCateg = (p.categ_id as [number, string] | false) || null;
      vals.push({
        name: p.name,
        default_code: p.default_code || false,
        list_price: p.list_price || 0,
        standard_price: p.standard_price || 0,
        barcode,
        description_sale: p.description_sale || false,
        categ_id: srcCateg ? catMap.get(srcCateg[0]) || false : false,
        sale_ok: true,
      });
    }

    let created = 0;
    let failed = 0;
    for (let i = 0; i < vals.length; i += BATCH_SIZE) {
      const batch = vals.slice(i, i + BATCH_SIZE);
      try {
        await target.execute('product.product', 'create', [batch], {}, BATCH_CREATE_TIMEOUT_MS);
        created += batch.length;
      } catch (err) {
        // One bad record poisons the whole batch — retry record by record.
        logger.warn(
          { err, db: store.odoo_db, batchStart: i },
          'Batch product create failed, retrying per record',
        );
        for (const v of batch) {
          try {
            await target.execute('product.product', 'create', [[v]]);
            created++;
          } catch (recordErr) {
            failed++;
            logger.warn({ err: recordErr, product: v.name }, 'Product create failed, skipping');
          }
        }
      }
      logger.info(
        { db: store.odoo_db, created, total: vals.length },
        'Catalog seed progress',
      );
    }

    logger.info(
      { db: store.odoo_db, masterDb, created, skipped, failed, categoriesCreated },
      'Catalog seed complete',
    );
    step.data = {
      master_db: masterDb,
      modules_installed: modulesInstalled,
      categories_created: categoriesCreated,
      products_created: created,
      products_skipped: skipped,
      products_failed: failed,
      source_count: products.length,
    };
  },
};
