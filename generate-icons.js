#!/usr/bin/env node
/**
 * Generates icons/icon16.png, icons/icon48.png, icons/icon128.png
 * No npm dependencies — uses only Node.js built-ins (zlib, fs, path).
 * Run: node generate-icons.js
 */

'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG builder ──────────────────────────────────────────────────────────────

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([typeB, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeB, data, crcVal]);
}

/**
 * drawFn(pixels, width, height)
 * pixels: Uint8Array of size width*height*4 (RGBA, pre-filled white)
 */
function createPNG(width, height, drawFn) {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  drawFn(pixels, width, height);

  // Build scanlines: filter-byte (0) + RGB per row (no alpha in output)
  const scanlines = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 3)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 3) + 1 + x * 3;
      const a = pixels[src + 3] / 255;
      scanlines[dst]     = Math.round(pixels[src]     * a + 255 * (1 - a));
      scanlines[dst + 1] = Math.round(pixels[src + 1] * a + 255 * (1 - a));
      scanlines[dst + 2] = Math.round(pixels[src + 2] * a + 255 * (1 - a));
    }
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ─────────────────────────────────────────────────────────────

function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= w || y < 0) return;
  const i = (y * w + x) * 4;
  // Alpha-blend over existing
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA);
  pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
  pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

function fillRect(pixels, w, x, y, rw, rh, r, g, b, a = 255) {
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++)
      setPixel(pixels, w, x + dx, y + dy, r, g, b, a);
}

function drawIcon(pixels, w, h) {
  // Background: indigo gradient
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const r = Math.round(99  + t * 30);   // ~#63 → ~#81
      const g = Math.round(102 - t * 20);   // ~#66 → ~#52
      const b = Math.round(241 - t * 40);   // ~#f1 → ~#c9
      setPixel(pixels, w, x, y, r, g, b);
    }
  }

  // Draw letter "S" in white
  // Scale relative to icon size
  const pad = Math.max(1, Math.round(w * 0.18));
  const fw  = w - pad * 2;
  const fh  = h - pad * 2;
  const th  = Math.max(1, Math.round(fh * 0.18)); // stroke thickness

  const x0 = pad;
  const y0 = pad;

  // Top bar
  fillRect(pixels, w, x0, y0, fw, th, 255, 255, 255);
  // Middle bar
  fillRect(pixels, w, x0, y0 + Math.round((fh - th) / 2), fw, th, 255, 255, 255);
  // Bottom bar
  fillRect(pixels, w, x0, y0 + fh - th, fw, th, 255, 255, 255);
  // Top-left vertical (from top bar down to middle)
  fillRect(pixels, w, x0, y0, th, Math.round(fh / 2), 255, 255, 255);
  // Bottom-right vertical (from middle down to bottom bar)
  fillRect(pixels, w, x0 + fw - th, y0 + Math.round(fh / 2), th, Math.ceil(fh / 2), 255, 255, 255);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const png = createPNG(size, size, drawIcon);
  const out = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`  Created: ${out}`);
});

console.log('Icons generated successfully.');
