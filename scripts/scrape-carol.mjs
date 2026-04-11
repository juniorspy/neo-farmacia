// Scrape Farmacia Carol catalog for ~100 common pharmacy products.
// Outputs: scripts/products-seed.json
// Usage: node scrape-carol.mjs

import axios from "axios";
import * as cheerio from "cheerio";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = "https://tienda.farmaciacarol.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// How many products to pull from each (sub)category.
// Farmacia Carol uses ASP.NET PostBack pagination, so we can't easily get page 2+.
// Instead, we scrape page 1 of many targeted subcategories to reach ~100 products.
const CATEGORIES = [
  // Medicamentos (broad)
  { slug: "medicamentos-c-list.aspx", category: "Medicamentos", take: 30 },

  // Salud y Nutrición
  { slug: "salud-y-nutricion-list.aspx", category: "Vitaminas y Suplementos", take: 10 },
  { slug: "otros-suplementos-list.aspx", category: "Vitaminas y Suplementos", take: 5 },
  { slug: "manejo-de-diabetes-list.aspx", category: "Cardiovascular / Crónicos", take: 5 },

  // Cuidado Personal
  { slug: "salud-oral-list.aspx", category: "Cuidado Personal", take: 6 },
  { slug: "cuidado-capilar-list.aspx", category: "Cuidado Personal", take: 6 },
  { slug: "desechables-list.aspx", category: "Cuidado Personal", take: 5 },
  { slug: "antibacteriales-list.aspx", category: "Cuidado Personal", take: 5 },

  // Primeros auxilios
  { slug: "primeros-auxilios-list.aspx", category: "Primeros Auxilios", take: 5 },
  { slug: "gasas-parchos-list.aspx", category: "Primeros Auxilios", take: 5 },
  { slug: "vendas-list.aspx", category: "Primeros Auxilios", take: 3 },

  // Bebé
  { slug: "salud-del-beb%C3%A9-list.aspx", category: "Cuidado del Bebé", take: 5 },
  { slug: "pa%C3%B1ales-y-wipes-list.aspx", category: "Cuidado del Bebé", take: 5 },
  { slug: "alimentaci%C3%B3n-y-cuidados-list.aspx", category: "Cuidado del Bebé", take: 3 },

  // Dermocosmética
  { slug: "cuidado-facial-list.aspx", category: "Dermocosmética", take: 5 },
  { slug: "cuidado-corporal-list.aspx", category: "Dermocosmética", take: 5 },

  // Otros comunes en farmacia
  { slug: "ojos-y-oidos-list.aspx", category: "Oftálmicos", take: 5 },
  { slug: "repelentes-list.aspx", category: "Cuidado Personal", take: 3 },
];

function normalizePrice(raw) {
  // "Precio:\n $1,384.00" or "$1,730.00\n$1,384.00"
  // Take the LAST dollar amount (lowest / sale price)
  const matches = raw.match(/\$\s*([\d,]+\.?\d*)/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const num = parseFloat(last.replace("$", "").replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

function cleanName(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

function slugFromUrl(url) {
  // "telekast-10-mg-30-tabletas-details.aspx" → "telekast-10-mg-30-tabletas"
  return url.replace(/-details\.aspx$/, "").replace(/\.aspx$/, "");
}

function extractSkuFromImage(imgUrl) {
  // "/Images/Products/1000102.jpg" → "1000102"
  const match = imgUrl.match(/\/Images\/Products\/(\d+)\./);
  return match ? match[1] : null;
}

// Quick category guess based on keywords in the product name
function guessCategory(name, defaultCategory) {
  const n = name.toUpperCase();
  const rules = [
    { keywords: ["IBUPROFENO", "ACETAMINOFEN", "PARACETAMOL", "DOLEX", "ADVIL", "NAPROXENO", "DICLOFENAC", "TRAMADOL", "ASPIRINA"], cat: "Analgésicos" },
    { keywords: ["AMOXICILINA", "AZITROMICINA", "CEFIXIMA", "CIPROFLOX", "CEFTRIAX", "METRONIDAZOL"], cat: "Antibióticos" },
    { keywords: ["LORATADINA", "CETIRIZINA", "CLARITYNE", "BILAXTEN", "DESLORATADINA", "FEXOFENADINA"], cat: "Antialérgicos" },
    { keywords: ["OMEPRAZOL", "RANITIDINA", "ESOMEPRAZOL", "LOPERAMIDA", "METOCLOPRAMIDA", "DOMPERIDONA", "SALES DE REHIDRATACION"], cat: "Gastrointestinal" },
    { keywords: ["ENALAPRIL", "LOSARTAN", "AMLODIPINO", "ATENOLOL", "CARVEDILOL", "ATORVASTATINA", "CLOPIDOGREL", "METFORMINA", "GLIBENCLAMIDA"], cat: "Cardiovascular / Crónicos" },
    { keywords: ["VITAMINA", "COMPLEJO B", "CALCIO", "HIERRO", "ZINC", "OMEGA", "CENTRUM", "MULTIVITAM"], cat: "Vitaminas y Suplementos" },
    { keywords: ["SHAMPOO", "PASTA DENTAL", "JABON", "DESODORANTE", "CEPILLO", "TALCO", "CREMA DENTAL"], cat: "Cuidado Personal" },
    { keywords: ["PAÑAL", "PAMPERS", "BIBERON", "TETERO", "FORMULA INFANTIL", "NAN", "SIMILAC"], cat: "Cuidado del Bebé" },
    { keywords: ["ALCOHOL", "AGUA OXIGENADA", "GASA", "CURITA", "ESPARADRAPO", "TERMOMETRO", "VENDA"], cat: "Primeros Auxilios" },
    { keywords: ["CREMA", "LOCION", "PROTECTOR SOLAR"], cat: "Dermocosmética" },
  ];
  for (const rule of rules) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.cat;
  }
  return defaultCategory;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    timeout: 30000,
  });
  return res.data;
}

async function scrapeCategory(catDef) {
  console.log(`\n→ Scraping ${catDef.category} (${catDef.take} products)`);
  const products = [];
  let page = 1;

  while (products.length < catDef.take) {
    const url = page === 1
      ? `${BASE}/${catDef.slug}`
      : `${BASE}/${catDef.slug}?page=${page}`;

    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.log(`  page ${page}: fetch failed (${err.message})`);
      break;
    }

    const $ = cheerio.load(html);
    const items = $(".CommonProductItemStyle");
    if (items.length === 0) {
      console.log(`  page ${page}: no items found — stopping`);
      break;
    }

    items.each((_, el) => {
      if (products.length >= catDef.take) return false;
      const item = $(el);
      const name = cleanName(item.find(".CommonProductName").text());
      const priceRaw = item.find(".CommonProductPriceDetails").text();
      const price = normalizePrice(priceRaw);
      const link = item.find("a.ProductLink").attr("href");
      const img = item.find("a.ProductLink img").attr("src");

      if (!name || !price || !link || !img) return;
      if (img.includes("DefaultNoImage")) return; // skip products without real images

      const sku = extractSkuFromImage(img);
      if (!sku) return;

      // Dedupe
      if (products.some((p) => p.sku === sku)) return;

      const imageUrl = img.startsWith("http") ? img : `${BASE}${img}`;
      const productUrl = `${BASE}/${link}`;

      products.push({
        sku,
        name,
        price,
        category: guessCategory(name, catDef.category),
        imageUrl,
        productUrl,
        slug: slugFromUrl(link),
      });
    });

    console.log(`  page ${page}: ${items.length} items scraped, ${products.length}/${catDef.take} collected`);
    page++;

    if (page > 20) {
      console.log("  stopping: page cap reached");
      break;
    }

    // Be nice to the server
    await new Promise((r) => setTimeout(r, 500));
  }

  return products;
}

async function main() {
  console.log("Scraping Farmacia Carol catalog...");

  const allProducts = [];
  for (const catDef of CATEGORIES) {
    try {
      const products = await scrapeCategory(catDef);
      allProducts.push(...products);
    } catch (err) {
      console.error(`Failed to scrape ${catDef.category}:`, err.message);
    }
  }

  const outPath = join(__dirname, "products-seed.json");
  await writeFile(outPath, JSON.stringify(allProducts, null, 2));

  console.log(`\n✔ Scraped ${allProducts.length} products`);
  console.log(`✔ Saved to ${outPath}`);

  // Summary by category
  const summary = {};
  for (const p of allProducts) {
    summary[p.category] = (summary[p.category] || 0) + 1;
  }
  console.log("\nBy category:");
  for (const [cat, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
