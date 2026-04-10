import axios from 'axios';

const ODOO_URL = 'https://pos.leofarmacia.com';
const DB = 'odoo';
const USER = 'admin';
const PASS = 'admin';

async function jsonRpc(url, method, params) {
  const res = await axios.post(url, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'call',
    params,
  });
  if (res.data.error) {
    throw new Error(JSON.stringify(res.data.error));
  }
  return res.data.result;
}

async function execute(uid, model, method, args, kwargs = {}) {
  return jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'object',
    method: 'execute_kw',
    args: [DB, uid, PASS, model, method, args, kwargs],
  });
}

async function main() {
  // Authenticate
  const uid = await jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'common',
    method: 'authenticate',
    args: [DB, USER, PASS, {}],
  });
  console.log('Authenticated. UID:', uid);

  // ========================================
  // 1. Enable lot tracking & expiry dates
  // ========================================
  console.log('\n--- Enabling Lot Tracking & Expiry ---');

  // Enable tracking on stock settings
  const configIds = await execute(uid, 'res.config.settings', 'create', [{
    group_stock_production_lot: true,
    group_stock_lot_print_gs1: false,
    module_product_expiry: true,
  }]);
  await execute(uid, 'res.config.settings', 'execute', [[configIds]]);
  console.log('✓ Lot tracking and expiry dates enabled');

  // ========================================
  // 2. Create product categories
  // ========================================
  console.log('\n--- Creating Product Categories ---');

  const categories = [
    { name: 'Medicamentos' },
    { name: 'OTC (Sin Receta)', parent: 'Medicamentos' },
    { name: 'Con Receta', parent: 'Medicamentos' },
    { name: 'Controlados', parent: 'Medicamentos' },
    { name: 'Cuidado Personal' },
    { name: 'Suplementos' },
  ];

  const categoryIds = {};

  for (const cat of categories) {
    const parentId = cat.parent ? categoryIds[cat.parent] : false;
    const existing = await execute(uid, 'product.category', 'search', [
      [['name', '=', cat.name]],
    ]);
    if (existing.length > 0) {
      categoryIds[cat.name] = existing[0];
      console.log(`  ⏭ ${cat.name} already exists`);
    } else {
      const id = await execute(uid, 'product.category', 'create', [{
        name: cat.name,
        parent_id: parentId,
      }]);
      categoryIds[cat.name] = id;
      console.log(`  ✓ Created: ${cat.name}`);
    }
  }

  // ========================================
  // 3. Create sample pharmacy products
  // ========================================
  console.log('\n--- Creating Sample Products ---');

  const products = [
    // OTC
    { name: 'Paracetamol 500mg', price: 85, category: 'OTC (Sin Receta)', barcode: '7861234500001' },
    { name: 'Ibuprofeno 400mg', price: 120, category: 'OTC (Sin Receta)', barcode: '7861234500002' },
    { name: 'Acetaminofen Jarabe Infantil 120ml', price: 195, category: 'OTC (Sin Receta)', barcode: '7861234500003' },
    { name: 'Omeprazol 20mg', price: 150, category: 'OTC (Sin Receta)', barcode: '7861234500004' },
    { name: 'Loratadina 10mg', price: 95, category: 'OTC (Sin Receta)', barcode: '7861234500005' },
    { name: 'Aspirina 500mg', price: 75, category: 'OTC (Sin Receta)', barcode: '7861234500006' },
    { name: 'Cetirizina 10mg', price: 110, category: 'OTC (Sin Receta)', barcode: '7861234500007' },
    { name: 'Vitamina C 1000mg', price: 200, category: 'Suplementos', barcode: '7861234500008' },
    { name: 'Antigripal (Sobre)', price: 45, category: 'OTC (Sin Receta)', barcode: '7861234500009' },
    { name: 'Alcohol Isopropilico 500ml', price: 130, category: 'Cuidado Personal', barcode: '7861234500010' },
    // Con Receta
    { name: 'Amoxicilina 500mg', price: 250, category: 'Con Receta', barcode: '7861234500011' },
    { name: 'Azitromicina 500mg', price: 350, category: 'Con Receta', barcode: '7861234500012' },
    { name: 'Metformina 850mg', price: 180, category: 'Con Receta', barcode: '7861234500013' },
    { name: 'Losartan 50mg', price: 220, category: 'Con Receta', barcode: '7861234500014' },
    { name: 'Atorvastatina 20mg', price: 280, category: 'Con Receta', barcode: '7861234500015' },
    // Controlados
    { name: 'Clonazepam 2mg', price: 320, category: 'Controlados', barcode: '7861234500016' },
    // Cuidado Personal
    { name: 'Protector Solar SPF 50', price: 450, category: 'Cuidado Personal', barcode: '7861234500017' },
    { name: 'Curitas (Caja 20)', price: 65, category: 'Cuidado Personal', barcode: '7861234500018' },
    // Suplementos
    { name: 'Multivitaminico Adulto', price: 380, category: 'Suplementos', barcode: '7861234500019' },
    { name: 'Omega 3 1000mg', price: 420, category: 'Suplementos', barcode: '7861234500020' },
  ];

  for (const prod of products) {
    const existing = await execute(uid, 'product.template', 'search', [
      [['name', '=', prod.name]],
    ]);
    if (existing.length > 0) {
      console.log(`  ⏭ ${prod.name} already exists`);
      continue;
    }

    const id = await execute(uid, 'product.template', 'create', [{
      name: prod.name,
      list_price: prod.price,
      type: 'product',
      categ_id: categoryIds[prod.category],
      barcode: prod.barcode,
      tracking: 'lot',
      use_expiration_date: true,
      sale_ok: true,
      purchase_ok: true,
    }]);
    console.log(`  ✓ ${prod.name} — RD$${prod.price} [${prod.category}]`);
  }

  // ========================================
  // 4. Verify
  // ========================================
  console.log('\n--- Verification ---');

  const allProducts = await execute(uid, 'product.template', 'search_read', [
    [['tracking', '=', 'lot']],
  ], {
    fields: ['name', 'list_price', 'categ_id', 'tracking', 'use_expiration_date'],
  });

  console.log(`✓ ${allProducts.length} products with lot tracking:`);
  allProducts.forEach(p => {
    console.log(`  - ${p.name} | RD$${p.list_price} | ${p.categ_id[1]} | Expiry: ${p.use_expiration_date}`);
  });

  console.log('\n✓ Pharmacy setup complete!');
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
