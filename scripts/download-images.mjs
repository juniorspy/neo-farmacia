// Download product images from products-seed.json into packages/dashboard/public/products/
// Usage: node download-images.mjs

import axios from "axios";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(REPO_ROOT, "packages", "dashboard", "public", "products");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function downloadImage(url, dest) {
  const res = await axios.get(url, {
    headers: { "User-Agent": UA },
    responseType: "arraybuffer",
    timeout: 30000,
  });
  await writeFile(dest, res.data);
}

async function main() {
  const seedPath = join(__dirname, "products-seed.json");
  const raw = await readFile(seedPath, "utf8");
  const products = JSON.parse(raw);

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Downloading ${products.length} images → ${OUTPUT_DIR}`);

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const ext = extname(new URL(p.imageUrl).pathname).toLowerCase() || ".jpg";
    const filename = `${p.sku}${ext}`;
    const dest = join(OUTPUT_DIR, filename);
    const localPath = `/products/${filename}`;

    try {
      await downloadImage(p.imageUrl, dest);
      p.localImagePath = localPath;
      ok++;
      if ((i + 1) % 10 === 0 || i === products.length - 1) {
        console.log(`  [${i + 1}/${products.length}] ${ok} ok, ${failed} failed`);
      }
    } catch (err) {
      failed++;
      console.error(`  failed: ${p.sku} ${p.name} → ${err.message}`);
      p.localImagePath = null;
    }

    // Gentle delay
    await new Promise((r) => setTimeout(r, 150));
  }

  // Save back with localImagePath filled in
  await writeFile(seedPath, JSON.stringify(products, null, 2));

  console.log(`\n✔ Downloaded ${ok}/${products.length} images`);
  if (failed > 0) console.log(`✘ ${failed} failed`);
  console.log(`✔ Updated ${seedPath} with localImagePath`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
