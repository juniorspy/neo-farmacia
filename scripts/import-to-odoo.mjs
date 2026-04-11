// Import products from products-seed.json into Odoo via JSON-RPC.
// Reuses existing categories where possible, creates missing ones.
// Loads images from packages/dashboard/public/products/{sku}.{ext} and
// sends them as base64 in image_1920.
//
// Env vars:
//   ODOO_URL (default https://pos.leofarmacia.com)
//   ODOO_DB (default odoo)
//   ODOO_USER (default admin)
//   ODOO_PASSWORD (default admin)
//
// Usage:
//   node import-to-odoo.mjs           # real import
//   node import-to-odoo.mjs --dry     # dry run (no writes)

import axios from "axios";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const IMAGES_DIR = join(REPO_ROOT, "packages", "dashboard", "public", "products");
const SEED_PATH = join(__dirname, "products-seed.json");

const ODOO_URL = process.env.ODOO_URL || "https://pos.leofarmacia.com";
const ODOO_DB = process.env.ODOO_DB || "odoo";
const ODOO_USER = process.env.ODOO_USER || "admin";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "admin";

const DRY_RUN = process.argv.includes("--dry");

// Map scraper category → Odoo category name (existing or to create)
const CATEGORY_MAP = {
  "Medicamentos": "Medicamentos / OTC (Sin Receta)",
  "Vitaminas y Suplementos": "Suplementos",
  "Cuidado Personal": "Cuidado Personal",
  "Primeros Auxilios": "Primeros Auxilios",
  "Dermocosmética": "Dermocosmética",
  "Cuidado del Bebé": "Cuidado del Bebé",
  "Cardiovascular / Crónicos": "Medicamentos / Con Receta",
  "Oftálmicos": "Oftálmicos",
  "Antialérgicos": "Medicamentos / OTC (Sin Receta)",
  "Antibióticos": "Medicamentos / Con Receta",
};

// ── Odoo RPC helpers ──

let uid = null;

async function rpc(service, method, params) {
  const res = await axios.post(`${ODOO_URL}/jsonrpc`, {
    jsonrpc: "2.0",
    method: "call",
    params: { service, method, args: params },
  }, { timeout: 60000 });

  if (res.data.error) {
    throw new Error(JSON.stringify(res.data.error));
  }
  return res.data.result;
}

async function authenticate() {
  uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}]);
  if (!uid) throw new Error("Odoo authentication failed");
  console.log(`✔ Authenticated as uid=${uid}`);
}

async function execute(model, method, args, kwargs = {}) {
  return rpc("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs]);
}

// ── Category management ──

const categoryCache = new Map();

async function getOrCreateCategoryByCompleteName(completeName) {
  if (categoryCache.has(completeName)) return categoryCache.get(completeName);

  const parts = completeName.split(" / ").map((p) => p.trim());
  let parentId = false;
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath} / ${part}` : part;

    // Look for existing child of parent with this name
    const domain = [["name", "=", part]];
    if (parentId) domain.push(["parent_id", "=", parentId]);
    else domain.push(["parent_id", "=", false]);

    const found = await execute("product.category", "search_read", [domain, ["id", "name"]], { limit: 1 });

    let id;
    if (found.length > 0) {
      id = found[0].id;
    } else {
      if (DRY_RUN) {
        console.log(`  [DRY] Would create category: ${currentPath}`);
        id = -1;
      } else {
        id = await execute("product.category", "create", [{ name: part, parent_id: parentId || false }]);
        console.log(`  + Created category: ${currentPath} (id=${id})`);
      }
    }

    categoryCache.set(currentPath, id);
    parentId = id;
  }

  return parentId;
}

// ── Image loading ──

async function loadImageBase64(sku) {
  const extensions = [".jpg", ".jpeg", ".png", ".gif"];
  for (const ext of extensions) {
    try {
      const path = join(IMAGES_DIR, `${sku}${ext}`);
      const buf = await readFile(path);
      return buf.toString("base64");
    } catch { /* try next */ }
  }
  return null;
}

// ── Product import ──

async function findProductByDefaultCode(defaultCode) {
  const found = await execute(
    "product.product",
    "search_read",
    [[["default_code", "=", defaultCode]], ["id", "name"]],
    { limit: 1 },
  );
  return found[0] || null;
}

async function createOrUpdateProduct(product, categId) {
  const defaultCode = `CAROL-${product.sku}`;
  const existing = await findProductByDefaultCode(defaultCode);

  const imageBase64 = await loadImageBase64(product.sku);

  const data = {
    name: product.name,
    default_code: defaultCode,
    list_price: product.price,
    standard_price: Math.round(product.price * 0.6 * 100) / 100, // fake cost (60% of price)
    categ_id: categId,
    sale_ok: true,
    purchase_ok: true,
    type: "consu",
    description_sale: `Categoría: ${product.category}`,
  };

  if (imageBase64) {
    data.image_1920 = imageBase64;
  }

  if (existing) {
    if (DRY_RUN) {
      console.log(`  [DRY] Would update: ${product.name} (id=${existing.id})`);
      return existing.id;
    }
    await execute("product.product", "write", [[existing.id], data]);
    return existing.id;
  } else {
    if (DRY_RUN) {
      console.log(`  [DRY] Would create: ${product.name}`);
      return -1;
    }
    const id = await execute("product.product", "create", [data]);
    return id;
  }
}

// ── Main ──

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Importing products to Odoo at ${ODOO_URL}`);

  await authenticate();

  const raw = await readFile(SEED_PATH, "utf8");
  const products = JSON.parse(raw);
  console.log(`Loaded ${products.length} products from seed\n`);

  // Pre-create all categories
  console.log("Ensuring categories...");
  const categoryIds = new Map();
  const uniqueCategories = new Set(Object.values(CATEGORY_MAP));
  for (const completeName of uniqueCategories) {
    const id = await getOrCreateCategoryByCompleteName(completeName);
    categoryIds.set(completeName, id);
  }
  console.log(`✔ ${categoryIds.size} categories ready\n`);

  // Import products
  console.log("Importing products...");
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const odooCategName = CATEGORY_MAP[p.category] || "Medicamentos / OTC (Sin Receta)";
    const categId = categoryIds.get(odooCategName);

    try {
      const existing = await findProductByDefaultCode(`CAROL-${p.sku}`);
      const productId = await createOrUpdateProduct(p, categId);
      if (existing) {
        updated++;
        if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${products.length}] ${created} created, ${updated} updated, ${failed} failed`);
      } else {
        created++;
        if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${products.length}] ${created} created, ${updated} updated, ${failed} failed`);
      }
      p.odooProductId = productId;
    } catch (err) {
      failed++;
      console.error(`  ✘ ${p.sku} ${p.name}: ${err.message.substring(0, 200)}`);
    }
  }

  console.log(`\n✔ Done: ${created} created, ${updated} updated, ${failed} failed`);

  if (!DRY_RUN) {
    // Persist odoo IDs back to the seed file
    const { writeFile } = await import("node:fs/promises");
    await writeFile(SEED_PATH, JSON.stringify(products, null, 2));
    console.log(`✔ Updated ${SEED_PATH} with odooProductId`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
