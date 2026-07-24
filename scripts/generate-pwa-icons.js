/**
 * scripts/generate-pwa-icons.js
 *
 * Rasterises the SVG source icon to PNG at 192×192 and 512×512.
 * Requires the `sharp` package: npm install --save-dev sharp
 *
 * Usage: node scripts/generate-pwa-icons.js
 */

const path = require("path");
const fs   = require("fs");

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("ERROR: sharp is not installed. Run: npm install --save-dev sharp");
    process.exit(1);
  }

  const src = path.join(__dirname, "../public/icons/icon-512.svg");
  if (!fs.existsSync(src)) {
    console.error(`ERROR: Source SVG not found at ${src}`);
    process.exit(1);
  }

  const out192 = path.join(__dirname, "../public/icons/icon-192.png");
  const out512 = path.join(__dirname, "../public/icons/icon-512.png");

  await sharp(src).resize(192, 192).png().toFile(out192);
  console.log(`✓ Generated ${out192}`);

  await sharp(src).resize(512, 512).png().toFile(out512);
  console.log(`✓ Generated ${out512}`);

  console.log("PWA icons generated successfully.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
