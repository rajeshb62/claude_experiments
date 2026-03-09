// generate-icons.mjs — Pure Node.js PNG icon generator (no dependencies)
// Run once before building: node generate-icons.mjs
// Creates public/icons/icon16.png, icon48.png, icon128.png

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

// ── CRC32 ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// ── PNG Builder ───────────────────────────────────────────────────────────────
// Draws a rounded-square icon with a "play" triangle on it.

function createIcon(size, bgRGB, fgRGB) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines: filter byte (0 = None) + RGB pixels
  const rowLen = 1 + size * 3;
  const raw = Buffer.allocUnsafe(size * rowLen);

  const radius = Math.round(size * 0.2);
  const cx = size / 2;
  const cy = size / 2;

  // Play triangle vertices (centered, pointing right, ~40% of icon size)
  const triH = size * 0.4;
  const triW = size * 0.35;
  const triLeft = cx - triW * 0.35;
  const triTop = cy - triH / 2;
  const triBot = cy + triH / 2;

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const offset = y * rowLen + 1 + x * 3;

      // Rounded-corner background mask
      const inBg = isInRoundedRect(x, y, size, size, radius);

      // Play triangle (simple point-in-triangle test)
      const t = (y - triTop) / (triBot - triTop); // 0..1 along height
      const leftEdge = triLeft;
      const rightEdge = triLeft + triW * t;
      const inTriangle =
        y >= triTop && y <= triBot && x >= leftEdge && x <= rightEdge;

      let r, g, b;
      if (inBg && inTriangle) {
        [r, g, b] = fgRGB;
      } else if (inBg) {
        [r, g, b] = bgRGB;
      } else {
        // Transparent → white background for PNG (it's opaque RGB)
        [r, g, b] = [255, 255, 255];
      }

      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  // zlib-compress the raw scanlines (PNG IDAT expects zlib format)
  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function isInRoundedRect(px, py, w, h, r) {
  // Check four corner circles; inside elsewhere
  const x = px + 0.5;
  const y = py + 0.5;
  if (x < r && y < r) return dist(x, y, r, r) <= r;
  if (x > w - r && y < r) return dist(x, y, w - r, r) <= r;
  if (x < r && y > h - r) return dist(x, y, r, h - r) <= r;
  if (x > w - r && y > h - r) return dist(x, y, w - r, h - r) <= r;
  return true;
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// ── Write Icons ───────────────────────────────────────────────────────────────

mkdirSync('public/icons', { recursive: true });

const BG = [26, 115, 232];   // #1a73e8 (Google Blue)
const FG = [255, 255, 255];  // white play triangle

for (const size of [16, 48, 128]) {
  const png = createIcon(size, BG, FG);
  writeFileSync(`public/icons/icon${size}.png`, png);
  console.log(`✓ public/icons/icon${size}.png (${png.length} bytes)`);
}

console.log('\nIcons ready. Run "npm run build" next.');
