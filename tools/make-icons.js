#!/usr/bin/env node
// Placeholder artwork with no dependencies: a lotus-gold disc on the evening background.
// Replace public/images/{icon-192,icon-512,logo,cover}.png with your own (same names, same sizes).
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const OUT = path.join(__dirname, "..", "public", "images");
function crcTable() { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
const T = crcTable(); const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = draw(x / size, y / size); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const BG = [20, 17, 15], GOLD = [234, 205, 152], DEEP = [150, 105, 45], GREEN = [92, 207, 150];
function lotus(u, v) {                       // a disc with eight soft petals and a green centre
  const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y), a = Math.atan2(y, x);
  const petal = 0.30 + 0.06 * Math.cos(8 * a);
  if (r < 0.07) return [...GREEN, 255];
  if (r < petal) return [...mix(GOLD, DEEP, r / petal), 255];
  if (r < petal + 0.012) return [...mix(DEEP, BG, 0.5), 255];
  const glow = Math.max(0, 1 - (r - petal) / 0.25) * 0.18;
  return [...mix(BG, GOLD, glow), 255];
}
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["logo.png", 96], ["cover.png", 480]]) fs.writeFileSync(path.join(OUT, name), png(size, lotus));
// three demo "figure" pictures for the Live card (replace with real artwork via "img" in prayers.json)
const hues = [[92, 207, 150], [236, 236, 230], [230, 190, 90]];
hues.forEach((c, i) => fs.writeFileSync(path.join(OUT, `figure-0${i + 1}.svg`),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><radialGradient id="g" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="rgb(${c})"/><stop offset="1" stop-color="#14110f"/></radialGradient></defs>` +
  `<rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="150" r="70" fill="none" stroke="#eacd98" stroke-width="3" opacity=".8"/>` +
  `<text x="150" y="172" text-anchor="middle" font-family="Georgia,serif" font-size="64" fill="#14110f">${i + 1}</text>` +
  `<path d="M60 330 Q150 250 240 330 Q150 300 60 330Z" fill="#eacd98" opacity=".7"/></svg>`));
console.log("Wrote placeholder images to", OUT);
