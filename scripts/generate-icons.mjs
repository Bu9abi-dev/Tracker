// Generates the PWA / home-screen icons in public/icons. Run: node scripts/generate-icons.mjs
import sharp from "sharp";

// Full-bleed square (iOS and maskable icons get their corners rounded by the OS).
const svg = (padding) => {
  const s = 512;
  const inner = s - padding * 2;
  const p = (x, y) => `${padding + x * inner},${padding + y * inner}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#18181b"/>
  <polyline points="${p(0.14, 0.7)} ${p(0.38, 0.5)} ${p(0.56, 0.6)} ${p(0.84, 0.28)}"
    fill="none" stroke="#fafafa" stroke-width="${inner * 0.07}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${padding + 0.84 * inner}" cy="${padding + 0.28 * inner}" r="${inner * 0.075}" fill="#60a5fa"/>
  <line x1="${padding + 0.14 * inner}" y1="${padding + 0.84 * inner}" x2="${padding + 0.84 * inner}" y2="${padding + 0.84 * inner}"
    stroke="#52525b" stroke-width="${inner * 0.03}" stroke-linecap="round"/>
</svg>`;
};

const out = [
  ["icon-32.png", 32, 40],
  ["icon-192.png", 192, 40],
  ["icon-512.png", 512, 40],
  ["apple-touch-icon.png", 180, 40],
  ["icon-maskable-512.png", 512, 96],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log("wrote", name);
}
