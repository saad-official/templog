#!/usr/bin/env node
// Placeholder app icon set ("stainless and heat"): a heat-orange thermometer on steel.
//   assets/icons/icon.png                     1024² opaque: steel background + thermometer (iOS / primary)
//   assets/icons/icon-foreground.png          1024² transparent thermometer inside the adaptive safe zone
//   assets/icons/icon-background.png          1024² solid steel (Android adaptive background)
//   assets/icons/icon-monochrome.png          1024² white thermometer (Android 13 themed icon, notification icon)
//   assets/widget-preview/next-check-2x2.png  Android widget picker preview
// Colours come from packages/shared/src/tokens.ts when it defines them (`accent`, `steel` / dark
// `background`), otherwise the defaults below. Re-run with `pnpm --filter mobile icons`.
// PNGs are encoded with sharp when it resolves from the workspace, otherwise with the tiny zlib
// encoder below. Replace with designed art before release.
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const tokensPath = join(appRoot, '..', '..', 'packages', 'shared', 'src', 'tokens.ts');
const iconsDir = join(appRoot, 'assets', 'icons');
const previewDir = join(appRoot, 'assets', 'widget-preview');
const SIZE = 1024;

const DEFAULTS = { steel: '#0F1416', heat: '#FF5A1F', body: '#E8EDEF', track: '#2A3337' };

/** Best-effort token read (plain-text parse: the source is TypeScript). */
function readColors() {
  const colors = { ...DEFAULTS };
  if (!existsSync(tokensPath)) return colors;
  const src = readFileSync(tokensPath, 'utf8');
  const heat = src.match(/\b(?:heat|accent):\s*["'](#[0-9A-Fa-f]{6})["']/)?.[1];
  if (heat) colors.heat = heat;
  return colors;
}

// ---------------------------------------------------------------------------
// Rasteriser: RGBA buffer + anti-aliased shapes via signed distance fields

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function canvas(w, h, fill = [0, 0, 0, 0]) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(fill, i * 4);
  return { w, h, px };
}

function blend(c, x, y, rgb, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const a0 = c.px[i + 3] / 255;
  const a = alpha + a0 * (1 - alpha);
  for (let k = 0; k < 3; k++) {
    c.px[i + k] = a > 0 ? Math.round((rgb[k] * alpha + c.px[i + k] * a0 * (1 - alpha)) / a) : 0;
  }
  c.px[i + 3] = Math.round(a * 255);
}

/** Fills every pixel whose signed distance `sdf(x, y)` is negative, inside the bounding box. */
function fill(c, box, sdf, rgb) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  for (let y = Math.max(0, y0); y <= Math.min(c.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(c.w - 1, x1); x++) {
      blend(c, x, y, rgb, clamp01(0.5 - sdf(x + 0.5, y + 0.5)));
    }
  }
}

/** Distance to a vertical capsule from (cx, top) to (cx, bottom) with radius r. */
const vCapsule = (cx, top, bottom, r) => (x, y) => Math.hypot(x - cx, y - Math.max(top, Math.min(bottom, y))) - r;
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const union = (...fs) => (x, y) => Math.min(...fs.map((f) => f(x, y)));
const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  const qx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const qy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return Math.hypot(qx, qy) - r;
};

/**
 * Thermometer glyph centred at (cx, cy), total height `h`: a rounded stem with a bulb, a mercury
 * column filled to `level` (0…1 of the stem), and tick marks on the right.
 */
function drawThermometer(c, { cx, cy, h, body, mercury, ticks, level = 0.62, outline = true }) {
  const bulbR = h * 0.17;
  const stemR = h * 0.085;
  const top = cy - h / 2 + stemR;
  const bulbCy = cy + h / 2 - bulbR;
  const pad = h * 0.04;
  const box = [cx - bulbR - 4, cy - h / 2 - 4, cx + bulbR + h * 0.25, cy + h / 2 + 4];
  if (outline) fill(c, box, union(vCapsule(cx, top, bulbCy, stemR), circle(cx, bulbCy, bulbR)), body);
  const innerStemR = outline ? stemR - pad : stemR;
  const innerBulbR = outline ? bulbR - pad : bulbR;
  const stemBottom = bulbCy;
  const mercuryTop = stemBottom - (stemBottom - top) * level;
  fill(c, box, union(vCapsule(cx, mercuryTop, stemBottom, innerStemR), circle(cx, bulbCy, innerBulbR)), mercury);
  if (ticks) {
    const tickX = cx + stemR + h * 0.06;
    for (let i = 0; i < 4; i++) {
      const ty = top + (i + 0.5) * ((bulbCy - bulbR - top) / 4);
      const len = i % 2 === 0 ? h * 0.12 : h * 0.07;
      fill(c, box, roundedRect(tickX, ty - h * 0.012, tickX + len, ty + h * 0.012, h * 0.012), ticks);
    }
  }
}

// ---------------------------------------------------------------------------
// PNG encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePngFallback({ w, h, px }, opaque) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((w * channels + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * channels + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = row + 1 + x * channels;
      raw[d] = px[s];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s + 2];
      if (!opaque) raw[d + 3] = px[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function loadSharp() {
  try {
    const require = createRequire(join(appRoot, 'package.json'));
    return require('sharp');
  } catch {
    return null;
  }
}

const sharp = loadSharp();

async function writePng(path, c, { opaque = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  if (sharp) {
    let img = sharp(c.px, { raw: { width: c.w, height: c.h, channels: 4 } });
    if (opaque) img = img.removeAlpha();
    await img.png({ compressionLevel: 9 }).toFile(path);
  } else {
    writeFileSync(path, encodePngFallback(c, opaque));
  }
}

// ---------------------------------------------------------------------------

const WHITE = [255, 255, 255];

async function main() {
  const colors = readColors();
  const steel = hexToRgb(colors.steel);
  const heat = hexToRgb(colors.heat);
  const body = hexToRgb(colors.body);
  const ticks = mix(body, steel, 0.35);

  // Primary icon: steel square (iOS masks the corners) with a subtle lighter top.
  const full = canvas(SIZE, SIZE, [...steel, 255]);
  for (let y = 0; y < SIZE; y++) {
    const glow = mix(steel, hexToRgb(colors.track), (1 - y / SIZE) * 0.35);
    for (let x = 0; x < SIZE; x++) full.px.set([...glow, 255], (y * SIZE + x) * 4);
  }
  drawThermometer(full, { cx: SIZE * 0.47, cy: SIZE / 2, h: SIZE * 0.66, body, mercury: heat, ticks });
  await writePng(join(iconsDir, 'icon.png'), full, { opaque: true });

  // Adaptive icons show the central 66/108 of the canvas: keep the glyph well inside it.
  const fg = canvas(SIZE, SIZE);
  drawThermometer(fg, { cx: SIZE * 0.48, cy: SIZE / 2, h: SIZE * 0.44, body, mercury: heat, ticks });
  await writePng(join(iconsDir, 'icon-foreground.png'), fg);

  await writePng(join(iconsDir, 'icon-background.png'), canvas(SIZE, SIZE, [...steel, 255]), { opaque: true });

  const mono = canvas(SIZE, SIZE);
  drawThermometer(mono, { cx: SIZE * 0.48, cy: SIZE / 2, h: SIZE * 0.44, body: WHITE, mercury: WHITE, ticks: WHITE, outline: false, level: 1 });
  await writePng(join(iconsDir, 'icon-monochrome.png'), mono);

  // Widget picker preview (2×2): steel card, compliance ring track + arc, thermometer, text bars.
  const P = 440;
  const preview = canvas(P, P);
  fill(preview, [0, 0, P, P], roundedRect(0, 0, P, P, 48), steel);
  const ringSdf = (from, to) => (x, y) => {
    const cx = P - 86;
    const cy = 86;
    const dx = x - cx;
    const dy = y - cy;
    const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    if (angle < from || angle > to) return 1;
    return Math.abs(Math.hypot(dx, dy) - 46) - 7;
  };
  fill(preview, [P - 150, 20, P - 20, 150], ringSdf(0, 1), hexToRgb(colors.track));
  fill(preview, [P - 150, 20, P - 20, 150], ringSdf(0, 0.86), heat);
  drawThermometer(preview, { cx: 80, cy: 300, h: 150, body, mercury: heat, ticks: null });
  fill(preview, [150, 262, 400, 300], roundedRect(150, 266, 390, 296, 15), body);
  fill(preview, [150, 310, 400, 345], roundedRect(150, 316, 300, 338, 11), heat);
  await writePng(join(previewDir, 'next-check-2x2.png'), preview);

  console.log(`Icons written to assets/icons and assets/widget-preview (${sharp ? 'sharp' : 'built-in PNG encoder'}).`);
  console.log(`steel ${colors.steel} · heat ${colors.heat}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
