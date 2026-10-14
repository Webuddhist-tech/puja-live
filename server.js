#!/usr/bin/env node
// puja-live server — no dependencies, Node 18+.
//
//   Public port  (default 8091, all interfaces):  the read-only viewer for phones, /events (SSE), prayers.json, images.
//                Put a tunnel (e.g. cloudflared) in front of this port only.
//   Console port (default 8090, 127.0.0.1):       the operator console, the OBS subtitle overlay and the control API.
//
// The console moves a pointer (state.index = a line of prayers.json). Every change is broadcast to every phone over
// Server-Sent Events, with the server's clock, so phones watching the video stream can replay the pointer N seconds late.

"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUB = path.join(ROOT, "public");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const PRAYERS = path.join(DATA, "prayers.json");
const STATE_FILE = path.join(DATA, "state.json");
const PUBLIC_PORT = +process.env.PORT || 8091;
const PUBLIC_HOST = process.env.HOST || "0.0.0.0";
const CONSOLE_PORT = +process.env.CONSOLE_PORT || 8090;
const CONSOLE_HOST = process.env.CONSOLE_HOST || "127.0.0.1";
const CONSOLE_PASSWORD = process.env.CONSOLE_PASSWORD || "";      // required if the console is exposed beyond localhost
const HISTORY_MS = 150e3;                                          // how much past the phones get (online delay ≤ 120 s)
const HEARTBEAT_MS = 25e3;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

/* ── versions: phones keep versioned links in cache; a new hash makes them fetch afresh ── */
const hashOf = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
const fileHash = (f) => { try { return hashOf(fs.readFileSync(f)); } catch { return "0"; } };
let textV = fileHash(PRAYERS);
try { JSON.parse(fs.readFileSync(PRAYERS, "utf8")); } catch (e) { console.error("⚠ data/prayers.json:", e.message); }

/* ── the live state ── */
const DEFAULT_STATE = { index: 0, set: false, hidden: false, round: 1, bookmark: null, mode: "verse", test: false,
  delay: 0, msg: "", back: 0, open: [], tara: "", reload: Date.now(), yt: {} };
let state = { ...DEFAULT_STATE };
try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))); } catch {}
let changedAt = Date.now();
let hist = [];                                   // [[serverTime, snapshot], …] for the last HISTORY_MS

function sanitize(patch) {                       // only known fields, of the right type
  const out = {};
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (num(patch.index)) out.index = Math.max(0, Math.floor(patch.index));
  for (const k of ["set", "hidden", "test"]) if (typeof patch[k] === "boolean") out[k] = patch[k];
  if (num(patch.round)) out.round = Math.max(1, Math.floor(patch.round));
  if (patch.bookmark === null || num(patch.bookmark)) out.bookmark = patch.bookmark;
  if (patch.mode === "verse" || patch.mode === "line") out.mode = patch.mode;
  if (num(patch.delay)) out.delay = Math.max(0, Math.min(120, Math.round(patch.delay)));
  if (typeof patch.msg === "string") out.msg = patch.msg.slice(0, 500);
  if (num(patch.back)) out.back = patch.back;
  if (Array.isArray(patch.open)) out.open = patch.open.filter((x) => typeof x === "string").slice(0, 20);
  if (typeof patch.tara === "string") out.tara = patch.tara.slice(0, 20);
  if (patch.reload === true) out.reload = Date.now();            // "Refresh all phones"
  if (patch.yt && typeof patch.yt === "object") {
    out.yt = {};
    for (const k of ["bo", "en", "zh", "ch"]) if (typeof patch.yt[k] === "string" && /^[\w-]{0,40}$/.test(patch.yt[k]) && patch.yt[k]) out.yt[k] = patch.yt[k];
  }
  return out;
}
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 1), () => {}), 300); }
function snapshot() { return { ...state }; }
function remember(t) {
  hist.push([t, snapshot()]);
  const cut = t - HISTORY_MS; while (hist.length > 1 && hist[1][0] <= cut) hist.shift();
}
function update(patch) {
  const p = sanitize(patch || {}); if (!Object.keys(p).length) return false;
  Object.assign(state, p); changedAt = Date.now(); remember(changedAt); save(); broadcast(); return true;
}
remember(changedAt);

/* ── Server-Sent Events ── */
const viewers = new Map();                       // res → { id, lang, where, app }
const consoles = new Set();
const message = (extra) => JSON.stringify({ ...snapshot(), t: changedAt, pv: textV, now: Date.now(), ...extra });
function sse(res, retry) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(`retry: ${retry}\n\n`);
}
function broadcast() {
  const data = `data: ${message()}\n\n`;
  for (const res of viewers.keys()) res.write(data);
  pushConsoles();
}
function stats() {
  const ids = new Map();                         // count phones (device ids), not connections (tabs)
  for (const v of viewers.values()) ids.set(v.id, v);
  const by = (k) => [...ids.values()].reduce((a, v) => ((a[v[k] || "?"] = (a[v[k] || "?"] || 0) + 1), a), {});
  return { phones: ids.size, connections: viewers.size, lang: by("lang"), where: by("where"),
    app: [...ids.values()].filter((v) => v.app).length };
}
function pushConsoles() {
  const data = `data: ${JSON.stringify({ state: snapshot(), t: changedAt, pv: textV, stats: stats() })}\n\n`;
  for (const res of consoles) res.write(data);
}
setInterval(() => {
  for (const res of viewers.keys()) res.write("event: hb\ndata: \n\n");
  for (const res of consoles) res.write("event: hb\ndata: \n\n");
}, HEARTBEAT_MS).unref();
setInterval(pushConsoles, 5000).unref();

function openViewerStream(req, res, q) {
  // a random retry so that, after a restart, a thousand phones do not come back in the same second
  sse(res, 3000 + Math.floor(Math.random() * 4000));
  const clip = (s) => String(s || "").slice(0, 64);
  viewers.set(res, { id: clip(q.get("id")) || crypto.randomUUID(), lang: clip(q.get("lang")), where: clip(q.get("where")), app: q.has("app") });
  res.write(`data: ${message({ hist: hist.slice(0, -1) })}\n\n`);
  req.on("close", () => viewers.delete(res));
}

/* ── prayers.json changed on disk: new version; phones fetch it within a minute ── */
fs.watchFile(PRAYERS, { interval: 1500 }, () => {
  const v = fileHash(PRAYERS); if (v === textV) return;
  textV = v; console.log("prayers.json changed →", v); broadcast();
}).unref();

/* ── static files ── */
function send(res, code, body, type = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(code, { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...headers }); res.end(body);
}
function safeJoin(base, p) {
  const f = path.normalize(path.join(base, decodeURIComponent(p)));
  return f.startsWith(base + path.sep) ? f : null;
}
function serveFile(res, f, versioned) {
  fs.readFile(f, (err, buf) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(f).toLowerCase();
    const cache = versioned ? "public, max-age=31536000, immutable" : /\.(png|jpe?g|webp|ttf|otf|woff2)$/.test(ext) ? "public, max-age=604800" : "no-cache";
    send(res, 200, buf, MIME[ext] || "application/octet-stream", { "Cache-Control": cache });
  });
}
// The viewer page is a template: {{TEXT_V}}, {{v:file}} (content hash for cache-busting) and /*{{font}}*/.
function renderPage(file) {
  let html = fs.readFileSync(path.join(PUB, file), "utf8");
  html = html.replace(/\{\{TEXT_V\}\}/g, textV).replace(/\{\{v:([\w./-]+)\}\}/g, (_, f) => fileHash(path.join(PUB, f)));
  const font = ["Jomolhari-Regular.ttf", "Jomolhari-Regular.woff2"].find((f) => fs.existsSync(path.join(PUB, "fonts", f)));
  html = html.replace("/*{{font}}*/", font ? `@font-face { font-family: "Jomolhari Local"; src: url("fonts/${font}"); font-display: swap; }` : "");
  return html;
}
function page(res, file) {
  try { send(res, 200, renderPage(file), MIME[".html"], { "Cache-Control": "no-cache" }); }
  catch (e) { send(res, 500, "Template error: " + e.message); }
}
function prayers(res) {
  fs.readFile(PRAYERS, (err, buf) => err ? send(res, 500, "prayers.json missing")
    : send(res, 200, buf, MIME[".json"], { "Cache-Control": "public, max-age=300" }));
}

/* ── public server: viewer only, read-only ── */
const PUBLIC_FILES = /^\/(viewer\.(css|js)|prayers\.js|t2s\.json|manifest\.json|robots\.txt|(images|fonts)\/[\w.-]+)$/;
const publicServer = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  if (u.pathname === "/" || u.pathname === "/viewer.html") return page(res, "viewer.html");
  if (u.pathname === "/events") return openViewerStream(req, res, u.searchParams);
  if (u.pathname === "/prayers.json") return prayers(res);
  if (PUBLIC_FILES.test(u.pathname)) { const f = safeJoin(PUB, u.pathname); if (f) return serveFile(res, f, u.searchParams.has("v")); }
  send(res, 404, "Not found");
});

/* ── console server: operator only ── */
function authorized(req) {
  if (!CONSOLE_PASSWORD) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || ""); if (!m) return false;
  const pass = Buffer.from(m[1], "base64").toString().split(":").slice(1).join(":");
  const a = Buffer.from(pass), b = Buffer.from(CONSOLE_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function body(req) {
  return new Promise((ok, no) => { let s = ""; req.on("data", (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } }); req.on("error", no); });
}
const consoleServer = http.createServer(async (req, res) => {
  if (!authorized(req)) return send(res, 401, "Password required", undefined, { "WWW-Authenticate": 'Basic realm="console"' });
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/" || u.pathname === "/console.html") return serveFile(res, path.join(PUB, "console.html"));
  if (u.pathname === "/obs" || u.pathname === "/obs.html") return serveFile(res, path.join(PUB, "obs.html"));
  if (u.pathname === "/viewer" || u.pathname === "/viewer.html") return page(res, "viewer.html");   // preview the phone page
  if (u.pathname === "/events") return openViewerStream(req, res, u.searchParams);
  if (u.pathname === "/prayers.json") { res.setHeader("Cache-Control", "no-store"); return fs.readFile(PRAYERS, (e, b) => e ? send(res, 500, "missing") : send(res, 200, b, MIME[".json"], { "Cache-Control": "no-store" })); }
  if (u.pathname === "/api/stream") {
    sse(res, 2000); consoles.add(res); req.on("close", () => consoles.delete(res));
    return res.write(`data: ${JSON.stringify({ state: snapshot(), t: changedAt, pv: textV, stats: stats() })}\n\n`);
  }
  if (u.pathname === "/api/state" && req.method === "GET") return send(res, 200, JSON.stringify({ state: snapshot(), t: changedAt, pv: textV, stats: stats() }), MIME[".json"]);
  if (u.pathname === "/api/state" && req.method === "POST") {
    try { update(await body(req)); return send(res, 200, JSON.stringify({ ok: true, state: snapshot() }), MIME[".json"]); }
    catch { return send(res, 400, "Bad JSON"); }
  }
  if (/^\/[\w./-]+$/.test(u.pathname)) { const f = safeJoin(PUB, u.pathname); if (f) return serveFile(res, f, u.searchParams.has("v")); }
  send(res, 404, "Not found");
});

if (require.main === module) {
  publicServer.listen(PUBLIC_PORT, PUBLIC_HOST, () => console.log(`Viewer   http://localhost:${PUBLIC_PORT}/   (public — point the tunnel here)`));
  consoleServer.listen(CONSOLE_PORT, CONSOLE_HOST, () => console.log(`Console  http://${CONSOLE_HOST}:${CONSOLE_PORT}/   OBS overlay: /obs`));
  if (CONSOLE_HOST !== "127.0.0.1" && CONSOLE_HOST !== "localhost" && !CONSOLE_PASSWORD) console.warn("⚠ The console is reachable from the network without CONSOLE_PASSWORD.");
}
module.exports = { publicServer, consoleServer, update, sanitize, getState: () => snapshot(), stats };
