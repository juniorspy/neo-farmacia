// End-to-end test of the command router.
// Exercises each command against the real API.
//
// Usage:
//   node test-commands.mjs
//
// Env: NEO_API_URL (default https://api.leofarmacia.com), NEO_API_KEY (optional)

import axios from "axios";

const API_URL = process.env.NEO_API_URL || "https://api.leofarmacia.com";
const API_KEY = process.env.NEO_API_KEY || "";
const STORE_ID = "store_leo";
const TEST_CHAT_ID = "whatsapp:+18091234567";

const headers = {
  "Content-Type": "application/json",
  ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
};

function cid(prefix) {
  return `test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function run(command, payload) {
  const body = {
    command,
    commandId: cid(command.replace(/\./g, "-")),
    storeId: STORE_ID,
    chatId: TEST_CHAT_ID,
    payload,
  };

  try {
    const res = await axios.post(`${API_URL}/api/v1/commands`, body, { headers, timeout: 20000 });
    return res.data;
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || err.message };
  }
}

function log(title, result) {
  const status = result.ok ? "✔" : "✘";
  console.log(`\n${status} ${title}`);
  console.log(JSON.stringify(result, null, 2).split("\n").slice(0, 20).join("\n"));
  if (JSON.stringify(result).length > 1000) console.log("   ... (truncated)");
}

async function main() {
  console.log(`Testing command router at ${API_URL}`);
  console.log(`Store: ${STORE_ID}, Chat: ${TEST_CHAT_ID}\n`);
  console.log("=".repeat(60));

  // 1. Lookup user (should not exist yet)
  log("1. usuario.lookupCombined (first time, should not exist)",
    await run("usuario.lookupCombined", { chatId: TEST_CHAT_ID }));

  // 2. Create user
  log("2. usuario.ensure (create new)",
    await run("usuario.ensure", {
      chatId: TEST_CHAT_ID,
      telefono: "+18091234567",
      nombre: "Test User",
      direccion: "Calle de prueba #1, Gazcue",
    }));

  // 3. Lookup again (should exist)
  log("3. usuario.lookupCombined (second time, should exist)",
    await run("usuario.lookupCombined", { chatId: TEST_CHAT_ID }));

  // 4. Search products — brand name
  log("4. catalogo.search 'dolex' (brand name → should find Acetaminofen)",
    await run("catalogo.search", { q: "dolex", limit: 3 }));

  // 5. Search products — with typo
  log("5. catalogo.search 'nievea' (typo → should find Nivea products)",
    await run("catalogo.search", { q: "nievea", limit: 3 }));

  // 6. Price query
  log("6. pedido.consultarPrecio 'ibuprofeno'",
    await run("pedido.consultarPrecio", { producto: "ibuprofeno" }));

  // 7. Find a real product first for the cart
  const productSearch = await run("catalogo.search", { q: "telekast", limit: 1 });
  const productoId = productSearch.result?.items?.[0]?.productoId;

  if (productoId) {
    // 8. Add to cart
    log("8. pedido.updateItems (add 2 units to cart)",
      await run("pedido.updateItems", {
        ops: [
          { op: "add", productoId, cantidad: 2, precio: productSearch.result.items[0].precio },
        ],
      }));
  } else {
    console.log("\n✘ Skipping cart test — could not find product for seeding");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done. Check results above.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
