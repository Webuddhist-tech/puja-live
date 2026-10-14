"use strict";
// The live protocol: console POST → every phone gets the state over SSE, with the server clock and recent history.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "puja-live-"));
fs.copyFileSync(path.join(__dirname, "..", "data", "prayers.json"), path.join(dir, "prayers.json"));
process.env.DATA_DIR = dir;
const { publicServer, consoleServer } = require("../server.js");

const listen = (srv) => new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv.address().port)));
const post = (port, body) => fetch(`http://127.0.0.1:${port}/api/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
function sse(port, onData) {                      // a minimal EventSource for tests
  const req = http.get(`http://127.0.0.1:${port}/events?id=test&lang=en&where=hall`, (res) => {
    let buf = "";
    res.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n\n")) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n"); if (data) onData(JSON.parse(data)); } });
  });
  return req;
}

test("live protocol", async (t) => {
  const pub = await listen(publicServer), con = await listen(consoleServer);
  t.after(() => { publicServer.close(); consoleServer.close(); publicServer.closeAllConnections?.(); consoleServer.closeAllConnections?.(); });

  await t.test("the public port serves the viewer, not the console API", async () => {
    const page = await fetch(`http://127.0.0.1:${pub}/`).then((r) => r.text());
    assert.match(page, /window\.TEXT_V = "[0-9a-f]{10}"/);
    assert.doesNotMatch(page, /\{\{/);
    assert.equal((await fetch(`http://127.0.0.1:${pub}/api/state`, { method: "POST", body: "{}" })).status, 405);
    assert.equal((await fetch(`http://127.0.0.1:${pub}/console.html`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${pub}/..%2fserver.js`)).status, 404);
  });

  await t.test("state is sanitised", async () => {
    const r = await post(con, { index: 3.7, set: true, mode: "bogus", delay: 999, evil: 1, yt: { en: "abc_DEF-1", zh: "<script>" } });
    assert.equal(r.state.index, 3);
    assert.equal(r.state.mode, "verse");
    assert.equal(r.state.delay, 120);
    assert.equal(r.state.evil, undefined);
    assert.deepEqual(r.state.yt, { en: "abc_DEF-1" });
  });

  await t.test("phones get the state, the server clock and history, then every change", async () => {
    const got = [];
    const req = sse(pub, (m) => got.push(m));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(got.length, 1);
    assert.equal(got[0].index, 3);
    assert.ok(Array.isArray(got[0].hist) && typeof got[0].now === "number" && typeof got[0].t === "number" && got[0].pv);
    await post(con, { index: 10 });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(got.length, 2);
    assert.equal(got[1].index, 10);
    assert.equal(got[1].hist, undefined);
    const st = await fetch(`http://127.0.0.1:${con}/api/state`).then((r) => r.json());
    assert.equal(st.stats.phones, 1);
    assert.equal(st.stats.where.hall, 1);
    req.destroy();
  });

  await t.test("a phone joining later receives recent history (for online delay)", async () => {
    const got = [];
    const req = sse(pub, (m) => got.push(m));
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(got[0].hist.some(([, s]) => s.index === 3), "earlier position is in history");
    req.destroy();
  });
});
