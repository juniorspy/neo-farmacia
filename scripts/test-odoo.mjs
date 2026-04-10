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

async function authenticate() {
  const uid = await jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'common',
    method: 'authenticate',
    args: [DB, USER, PASS, {}],
  });
  console.log('✓ Authenticated. UID:', uid);
  return uid;
}

async function searchProducts(uid) {
  const products = await jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'object',
    method: 'execute_kw',
    args: [DB, uid, PASS, 'product.product', 'search_read', [[]], {
      fields: ['name', 'list_price', 'qty_available', 'type'],
      limit: 10,
    }],
  });
  console.log(`✓ Found ${products.length} products:`);
  products.forEach(p => {
    console.log(`  - ${p.name} | $${p.list_price} | Stock: ${p.qty_available}`);
  });
  return products;
}

async function checkModules(uid) {
  const modules = await jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'object',
    method: 'execute_kw',
    args: [DB, uid, PASS, 'ir.module.module', 'search_read', [
      [['name', 'in', ['stock', 'sale', 'contacts']], ['state', '=', 'installed']]
    ], {
      fields: ['name', 'shortdesc', 'state'],
    }],
  });
  console.log(`✓ Installed modules:`);
  modules.forEach(m => {
    console.log(`  - ${m.shortdesc} (${m.name}): ${m.state}`);
  });
}

async function main() {
  console.log(`Testing Odoo JSON-RPC at ${ODOO_URL}\n`);

  // 1. Version check
  const version = await jsonRpc(`${ODOO_URL}/jsonrpc`, 'call', {
    service: 'common',
    method: 'version',
    args: [],
  });
  console.log('✓ Odoo version:', version.server_version);

  // 2. Authenticate
  const uid = await authenticate();

  // 3. Check installed modules
  await checkModules(uid);

  // 4. Search products
  console.log('');
  await searchProducts(uid);

  console.log('\n✓ All JSON-RPC tests passed!');
}

main().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
