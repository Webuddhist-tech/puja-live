// Makes public/t2s.json: every Traditional Chinese character used in data/prayers.json and in the page's own words
// (public/viewer.js) → its Simplified form,
// so phones can show 简体 without carrying a whole conversion library. Run after editing the Chinese text:
//   cd tools && npm install opencc-js && node make-t2s.mjs
// Check the result by eye: automatic conversion is good, not perfect (e.g. 著/着 in phonetics).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(fs.readFileSync(path.join(root, "data", "prayers.json"), "utf8"));
const chars = new Set();
const add = (text) => { for (const c of text) if (/\p{Script=Han}/u.test(c)) chars.add(c); };
JSON.stringify(doc, (k, v) => { if (typeof v === "string") add(v); return v; });
add(fs.readFileSync(path.join(root, "public", "viewer.js"), "utf8"));
const convert = OpenCC.Converter({ from: "tw", to: "cn" });
let t = "", s = "";
for (const c of chars) { const x = convert(c); if (x !== c && [...x].length === 1) { t += c; s += x; } }
fs.writeFileSync(path.join(root, "public", "t2s.json"), JSON.stringify({ t, s }) + "\n");
console.log(`t2s.json: ${[...t].length} characters differ in Simplified (of ${chars.size} used)`);
