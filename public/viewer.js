// puja-live viewer: the prayer text follows the puja, driven by the operator console over Server-Sent Events.
// Read-only; everything personal (language, size, counts) stays in this phone's localStorage.
/* global Prayers */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const B = document.body, root = document.documentElement;
  const { fillIn, findFigure, Fill } = Prayers;
  const PREFIX = "pl.";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} },
  };

  // iOS gives a page opened from the Home Screen its own empty storage. Before "Add to Home Screen" the install sheet
  // writes this phone's choices into the address (?k=…); the app takes them over the first time it opens.
  try {
    const k = new URLSearchParams(location.search).get("k");
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (k && standalone && localStorage.getItem(PREFIX + "lang") === null) {
      const o = JSON.parse(k); for (const x in o) if (/^\w+$/.test(x) && typeof o[x] === "string") localStorage.setItem(PREFIX + x, o[x]);
    }
    if (k) history.replaceState(null, "", location.pathname);
  } catch {}

  // Bump PAGE_V when this page changes; set "viewer" in prayers.json to the same number to reload every open phone once.
  const PAGE_V = 1;
  const SHOW_NEXT = false;                       // a faint "Next: …" under the Live card (off: only the live verse)
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let P = null, P0 = null, textV = window.TEXT_V || "0";
  let lang = store.get("lang", null), where = store.get("where", null);
  let hans = lang === "zhs"; if (hans) lang = "zh";           // Simplified = the Chinese text converted on the phone
  const choice = () => (hans ? "zhs" : lang);
  let follow = true, cur = null, lastShown = null, raw = null, liveSec = -1, onAir = false, link = "idle", yt = {};
  const opts = { size: store.get("size", 1), theme: store.get("theme", "evening"), meaning: store.get("meaning", true),
    notes: store.get("notes", true), script: store.get("script", false), own: store.get("own", null) };   // own = reader's delay (s), null = organisers'
  let view = store.get("view", "live") === "text" ? "text" : "live";

  const clean = (s) => (s || "").replace(/[༵༷]/g, "").replace(/\s+([།༎༔])/g, " $1").trim();   // keep the shad with its word
  const el = (t, c, x) => { const d = document.createElement(t); if (c) d.className = c; if (x != null) d.textContent = x; return d; };
  const dedupe = (a) => a.filter((x, i) => x && x !== a[i - 1]);

  /* ── Simplified Chinese: t2s.json maps the Traditional characters used in prayers.json (tools/make-t2s.mjs) ── */
  let T2S = new Map();
  const toS = (s) => [...String(s)].map((c) => T2S.get(c) ?? c).join("");
  async function loadT2S() {
    if (T2S.size) return;
    try { const r = await fetch("t2s.json?v=" + (window.T2S_V || "") + textV); if (r.ok) { const j = await r.json(); T2S = new Map([...j.t].map((c, i) => [c, [...j.s][i]])); } } catch {}
  }
  function forLang() {
    P = !hans ? P0 : JSON.parse(JSON.stringify(P0), (k, x) => ((k === "zh" || k === "trz") && typeof x === "string" ? toS(x) : x));
    Fill.pick = findFigure(P, pickId);
  }

  /* ── the page's own words (the prayers carry their languages themselves) ── */
  const WORDS = {
    en: { live: "LIVE", connecting: "Connecting…", reconnecting: "Reconnecting…", offline: "Offline — the text stays here",
      follow: "Follow live", behind: "· {n} behind", ahead: "· {n} ahead", settings: "Settings", done: "Done", contents: "Contents", liveNow: "Now", afterPuja: "After the puja",
      language: "Language", where: "Following from", hall: "In the hall", online: "Online", size: "Text size", theme: "Theme",
      evening: "Evening", parchment: "Parchment", dim: "Dim", show: "Show", script: "Tibetan script", meaning: "Translation", notes: "Ritual instructions",
      hallHint: "The text moves with the chanting as it happens.",
      delay: "The text is held back {n} s to match the video.",
      delayHint: "Highlighted verse ahead of what you hear? Press +. Behind? Press −.",
      noHint: "Adjust until the text matches what you hear (often 10–30 s).",
      organisers: "Timing set by the organisers.", useOrganisers: "Use the organisers’ timing ({n} s)",
      whereQ: "Where are you following from?", hallSub: "The text follows the chanting live", onlineName: "Watching online", onlineSub: "The text is timed to the video stream",
      later: "You can change this any time from the title at the top, or in Settings.", beginSoon: "The puja will begin soon", read: "Read the prayers",
      home: "Start screen: language and where you follow from", backToText: "← Back to the prayers", round: "Round {n}",
      mine: "My recitations", mineTxt: "{name}: {d} today · {a} in all (on this phone)", mineNone: "Each full round of {name} you follow here is counted on this phone.",
      recited: "✓ {name} — {d} today", backAt: "We resume at {t} · in about {n} min", backSoon: "We resume in a moment", close: "Close",
      afterBreak: "After the break: {s}", gTitle: "How it works", gOk: "Got it",
      g1: "Live shows the verse being chanted now, large. It moves on by itself.",
      g2: "Full text lets you scroll and read ahead; “Follow live” brings you back.",
      g3: "Contents lists every step of the puja. Settings: size, script, translation, theme.",
      fig: "{n} of {N}", tLive: "Live", tText: "Full text", next: "Next", stepOf: "Step {n} of {N}", mineToday: "{name} today: {d}",
      repeatAfter: "Repeat after the teacher", repOf: "{n} of {N}", repX: "×{N}", k_vis: "Visualisation", k_talk: "Explanation",
      thxT: "The empowerment verses are complete", thxOk: "Keep following",
      thx1: "The puja continues live — each verse highlighted as it is chanted, with its translation.",
      iTitle: "Get the app", iSub: "Free · no app store needed", iInstall: "Install — one tap", iChrome: "Open in Chrome",
      iP1: "Opens in one tap from your Home Screen", iP2: "Full screen: just the prayers", iP3: "No link to search for tomorrow",
      iHow: "How to add it", iShow: "Show me where", iCopy: "Copy the link", iInT: "First, open this in your browser",
      iInS: "Pages opened inside WeChat, WhatsApp and similar apps can’t be put on the Home Screen.", iCopied: "Link copied — paste it into Safari or Chrome",
      st1Dots: "Tap ⋯ at the bottom right", st1Share: "Tap Share at the bottom of the screen", st1ShareAny: "Tap the Share button",
      stShare: "Tap “Share”", stAdd: "Scroll down and tap “Add to Home Screen”", stAddDone: "Tap “Add” — done 🙏",
      stAndMenu: "Tap ⋮ at the top right (bottom right if the address bar is at the bottom)", stAndAdd: "Tap “Add to Home screen” or “Install app”", stAndDone: "Tap “Install” — done 🙏",
      stSamMenu: "Tap ≡ at the bottom right", stSamAdd: "Tap “Add page to”", stSamDone: "Tap “Home screen” — done 🙏",
      stAnyMenu: "Open the browser’s menu (⋮ or ≡)", stAnyDone: "Tap “Add” or “Install” — done 🙏",
      stAppMenu: "Tap ⋯ at the top right", stAppOpen: "Choose “Open in browser”", stAppThen: "Then add it to your Home Screen from there",
      acT: "Put this on your Home Screen", acS: "One tap to open, full screen. Free.", acNo: "Not now", acYes: "Show me how",
      acInT: "Open this in your browser", acInS: "It works best there, and can then go on your Home Screen.",
      appHi: "🙏 Welcome — opened from your Home Screen", installed: "🙏 Installed — it’s on your Home Screen",
      setApp: "Put it on your Home Screen", setAppS: "One tap to open, full screen", gApp: "Put it on your Home Screen — show me how ›", thxApp: "Open it in one tap tomorrow — add it to your Home Screen ›" },
    zh: { live: "直播", connecting: "連線中…", reconnecting: "重新連線中…", offline: "目前離線——經文仍可閱讀",
      follow: "跟隨直播", behind: "・落後 {n} 段", ahead: "・超前 {n} 段", settings: "設定", done: "完成", contents: "目錄", liveNow: "進行中", afterPuja: "法會之後",
      language: "語言", where: "參加方式", hall: "在現場", online: "線上", size: "字體大小", theme: "主題",
      evening: "深色", parchment: "淺色", dim: "暗", show: "顯示", script: "藏文", meaning: "譯文", notes: "儀軌說明",
      hallHint: "經文隨現場念誦即時移動。", delay: "經文延遲 {n} 秒，以配合影片。",
      delayHint: "反白的經文比您聽到的快，請按 +；較慢，請按 −。", noHint: "請調整至經文與聲音一致（通常 10–30 秒）。",
      organisers: "主辦方設定的時間。", useOrganisers: "使用主辦方的時間（{n} 秒）",
      whereQ: "您從哪裡參加？", hallSub: "經文與現場念誦同步", onlineName: "線上觀看", onlineSub: "經文配合直播影片的時間",
      later: "之後可隨時從上方標題或設定中更改。", beginSoon: "法會即將開始", read: "閱讀經文",
      home: "開始畫面：語言與參加方式", backToText: "← 返回經文", round: "第 {n} 遍",
      mine: "我的念誦", mineTxt: "{name}：今天 {d} 遍・共 {a} 遍（本手機）", mineNone: "您在此跟隨念誦的每一遍{name}都會記錄在本手機。",
      recited: "✓ {name}——今天 {d} 遍", backAt: "{t} 繼續・約 {n} 分鐘後", backSoon: "即將繼續", close: "關閉",
      afterBreak: "休息之後：{s}", gTitle: "使用說明", gOk: "知道了",
      g1: "直播：以大字顯示正在念誦的段落，會自動前進。", g2: "全文：可捲動閱讀；點「跟隨直播」回到目前位置。", g3: "目錄：法會所有段落。設定：字體、藏文、譯文、主題。",
      fig: "第 {n} 尊・共 {N} 尊", tLive: "直播", tText: "全文", next: "下一段", stepOf: "第 {n} 段・共 {N} 段", mineToday: "今天{name}：{d} 遍",
      repeatAfter: "隨上師複誦", repOf: "第 {n} 遍・共 {N} 遍", repX: "{N} 遍", k_vis: "觀想", k_talk: "講解",
      thxT: "隨許複誦文已圓滿", thxOk: "繼續跟隨", thx1: "法會仍在直播——每段念誦時即時反白並附譯文。",
      iTitle: "加入主畫面", iSub: "免費・不需 App Store", iInstall: "安裝——一點即可", iChrome: "用 Chrome 開啟",
      iP1: "從主畫面一點即開", iP2: "全螢幕，只有經文", iP3: "明天不必再找連結",
      iHow: "步驟", iShow: "告訴我在哪裡", iCopy: "複製連結", iInT: "請先用瀏覽器開啟", iInS: "在微信、WhatsApp 等 App 內無法加入主畫面。", iCopied: "已複製——請貼到 Safari 或 Chrome",
      st1Dots: "點右下角的 ⋯", st1Share: "點畫面下方的「分享」", st1ShareAny: "點「分享」按鈕", stShare: "點「分享」", stAdd: "往下滑，點「加入主畫面」", stAddDone: "點「加入」——完成 🙏",
      stAndMenu: "點右上角的 ⋮", stAndAdd: "點「加到主畫面」或「安裝應用程式」", stAndDone: "點「安裝」——完成 🙏",
      stSamMenu: "點右下角的 ≡", stSamAdd: "點「新增頁面至」", stSamDone: "點「主畫面」——完成 🙏", stAnyMenu: "打開瀏覽器選單（⋮ 或 ≡）", stAnyDone: "點「加入」或「安裝」——完成 🙏",
      stAppMenu: "點右上角的 ⋯", stAppOpen: "選「在瀏覽器中開啟」", stAppThen: "再從瀏覽器加入主畫面",
      acT: "加入主畫面", acS: "一點即開、全螢幕。免費。", acNo: "以後再說", acYes: "教我怎麼做", acInT: "請用瀏覽器開啟", acInS: "在瀏覽器中效果最好，也能加入主畫面。",
      appHi: "🙏 歡迎——已從主畫面開啟", installed: "🙏 已安裝到主畫面", setApp: "加入主畫面", setAppS: "一點即開、全螢幕", gApp: "加入主畫面——教我怎麼做 ›", thxApp: "明天一點即開——加入主畫面 ›" },
    bo: { hall: "ཚོགས་ཁང་ནང་།", onlineName: "དྲ་ཐོག་ནས།", contents: "དཀར་ཆག", beginSoon: "ཆོས་སྤྱོད་མྱུར་དུ་འགོ་འཛུགས་ཡོང་།" },   // more welcome — falls back to English
  };
  const w = (k, v = {}) => { const s = ((WORDS[lang] || {})[k] ?? WORDS.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ""); return hans ? toS(s) : s; };
  function words() {
    document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = w(e.dataset.t); e.lang = WORDS[lang] && e.dataset.t in WORDS[lang] ? root.lang : "en"; });
    $("aaBtn").setAttribute("aria-label", w("settings")); $("tocBtn").setAttribute("aria-label", w("contents")); $("homeBtn").setAttribute("aria-label", w("home"));
    $("whereQ").textContent = w("whereQ");
  }
  const tx = (t) => (!t ? "" : lang === "bo" ? t.bo || t.en : lang === "zh" ? t.zh || t.en : t.en || "");   // a {bo,en,zh} title in the reader's language
  const title = (t) => (lang === "zh" ? t.zh || t.en : t.en);

  /* ── settings ── */
  let hint = 0;                                  // the organisers' delay for online readers (s), set on the console
  const delay = () => (where === "online" ? Math.min(120, Math.max(0, opts.own ?? hint)) : 0);
  function applyOpts() {
    root.style.setProperty("--k", opts.size); root.dataset.theme = opts.theme;
    document.querySelector('meta[name="theme-color"]').content = { parchment: "#f6efe3", dim: "#000000" }[opts.theme] || "#14110f";
    B.classList.toggle("nomeaning", !opts.meaning); B.classList.toggle("nonotes", !opts.notes);
    B.classList.toggle("script", opts.script && lang !== "bo"); B.classList.toggle("notib", lang !== "bo" && !opts.script);
    for (const [id, on] of [["swMeaning", opts.meaning], ["swNotes", opts.notes], ["swScript", opts.script]]) $(id).setAttribute("aria-checked", on);
    $("rowMeaning").hidden = $("rowScript").hidden = lang === "bo";
    const r = recite(), nm = loopName(); $("mineTxt").textContent = r.all ? w("mineTxt", { d: r.today, a: r.all, name: nm }) : w("mineNone", { name: nm });
    const seg = (id, v) => $(id).querySelectorAll("button").forEach((b) => { const on = b.dataset.v == v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    seg("segLang", choice()); seg("segSize", opts.size); seg("segTheme", opts.theme); seg("segWhere", where);
    $("delayBox").hidden = where !== "online"; $("hallHint").hidden = where !== "hall"; paintYt();
    const d = delay();
    $("delay").value = Math.min(60, d); $("dVal").textContent = d + (lang === "zh" ? " 秒" : " s");
    $("delayTxt").textContent = [d ? w("delay", { n: d }) : "", opts.own === null ? (hint ? w("organisers") : w("noHint")) : w("delayHint")].join(" ").trim();
    $("dReset").hidden = opts.own === null || !hint; $("dReset").textContent = w("useOrganisers", { n: hint });
    $("ownTxt").textContent = P0 && P0.notice ? tx(P0.notice) : "";
    for (const k of Object.keys(opts)) store.set(k, opts[k]);
    if (P) paintView();
  }

  const rise = (e) => { clearTimeout(e._t); e.hidden = false; void e.offsetWidth; e.classList.add("open"); };
  const sink = (e) => { if (e.hidden) return; e.classList.remove("open"); clearTimeout(e._t); e._t = setTimeout(() => { if (!e.classList.contains("open")) e.hidden = true; }, calm ? 0 : 450); };
  let lastFocus = null;
  function openSheet(which) {                    // "sheet" | "toc" | "inst" | null
    for (const id of ["sheet", "toc", "inst"]) (id === which ? rise : sink)($(id));
    (which ? rise : sink)($("sheetBg"));
    if (which) { lastFocus = document.activeElement; if (which === "toc") paintToc(); $(which).focus({ preventScroll: true }); }
    else if (lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
  }
  $("aaBtn").onclick = () => openSheet("sheet");
  $("tocBtn").onclick = () => P && openSheet("toc");
  $("sheetBg").onclick = () => openSheet(null);
  document.querySelectorAll(".done").forEach((b) => (b.onclick = () => openSheet(null)));
  for (const s of [$("sheet"), $("toc"), $("inst")]) {          // drag a sheet down to put it away
    let y0 = null, dy = 0, t0 = 0;
    s.addEventListener("touchstart", (e) => { y0 = s.scrollTop <= 0 || e.target.closest(".sheet-h") ? e.touches[0].clientY : null; dy = 0; t0 = Date.now(); }, { passive: true });
    s.addEventListener("touchmove", (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { s.style.transition = "none"; s.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    s.addEventListener("touchend", () => { if (y0 === null) return; y0 = null; const away = dy > 110 || (dy > 40 && dy / (Date.now() - t0) > 0.6);
      s.style.transition = ""; s.style.transform = ""; if (away) openSheet(null); }, { passive: true });
  }
  addEventListener("keydown", (e) => { if (e.key === "Escape") { openSheet(null); uncoach(); $("lb").hidden = true; if (revisiting) closeStart(); } });
  const segVal = (e) => e.target.closest("button")?.dataset.v;
  $("segLang").onclick = async (e) => { const v = segVal(e); if (v && v !== choice()) { await setLang(v); reconnect(); } };
  $("segWhere").onclick = (e) => { const v = segVal(e); if (v && v !== where) setWhere(v); };
  $("segSize").onclick = (e) => { const v = segVal(e); if (v) { opts.size = +v; applyOpts(); recenter(true); } };
  $("segTheme").onclick = (e) => { const v = segVal(e); if (v) { opts.theme = v; applyOpts(); } };
  $("swMeaning").onclick = () => { opts.meaning = !opts.meaning; applyOpts(); recenter(true); };
  $("swNotes").onclick = () => { opts.notes = !opts.notes; applyOpts(); recenter(true); };
  $("swScript").onclick = () => { opts.script = !opts.script; applyOpts(); recenter(true); };
  const setOwn = (n) => { opts.own = Math.max(0, Math.min(120, Math.round(n))); applyOpts(); tick(); };
  $("dMinus").onclick = () => setOwn(delay() - 1); $("dPlus").onclick = () => setOwn(delay() + 1);
  $("delay").oninput = (e) => setOwn(+e.target.value);
  $("dReset").onclick = () => { opts.own = null; applyOpts(); tick(); };
  function setWhere(v) { where = v; store.set("where", v); applyOpts(); rewhere(); tick(); reconnect(); }
  function rewhere() { if (P && raw) { reveal(raw); lastShown = null; show(raw); } }

  /* ── Live / Full text ── */
  $("tLive").onclick = () => setView("live"); $("tText").onclick = () => setView("text");
  function setView(v) { view = v; store.set("view", v); follow = true; $("follow").classList.remove("on"); paintView(); recenter(true); requestAnimationFrame(() => recenter(true)); }
  function paintView() {
    const on = view === "live" && !!cur && onAir && !waiting;
    $("stage").hidden = !on; B.classList.toggle("staged", on);
    for (const [id, v] of [["tLive", "live"], ["tText", "text"]]) { $(id).classList.toggle("on", view === v); $(id).setAttribute("aria-pressed", view === v); }
    $("tabs").style.setProperty("--ti", view === "live" ? 0 : 1);
    root.style.setProperty("--hh", document.querySelector("header").offsetHeight + "px");
    root.style.setProperty("--tb", $("tabs").offsetHeight + "px");
    if (on) paintStage(false);
  }

  /* ── figures: a verse whose first line names one ("tara": id) shows its picture and name ── */
  function figOf(scr) {
    const sc = P.screens[scr]; if (!sc) return null;
    const l = P.lines[sc.first]; if (!l || !l.tara) return null;
    const prev = P.lines[sc.first - 1];
    if (prev && prev.sIdx === l.sIdx && prev.pi === l.pi && prev.v === l.v) return null;   // only on the verse's first screen
    return figure(l.tara);
  }
  function figure(id) {
    for (const s of P.sections) { const list = s.taras || []; const k = list.findIndex((x) => x.id === String(id)); if (k >= 0) return { ...list[k], n: k + 1, N: list.length }; }
    return null;
  }
  const figName = (f) => (!f || !f.name ? "" : tx(f.name));

  /* ── the Live card: a copy of the live verse from the full text, fitted to the screen ── */
  function paintStage(moved) {
    if ($("stage").hidden || !cur) return;
    const scr = +cur.dataset.scr, body = $("stBody");
    body.replaceChildren(...[...cur.children].map((x) => x.cloneNode(true)));
    // every line with a translation of its own → each under its line; otherwise one block below
    const ls = [...body.querySelectorAll(".l")];
    const tr = ls.map((d) => { const l = P.lines[+d.dataset.i]; return ((l && (lang === "zh" ? l.zh : l.en)) || "").trim(); });
    const pair = lang !== "bo" && ls.length > 1 && tr.every(Boolean) && dedupe(tr).length === tr.length;
    if (pair) { ls.forEach((d, n) => d.appendChild(fillIn(el("div", "t tl"), tr[n], false, lang === "zh" ? "zh" : "en"))); body.querySelector(".t:not(.tl)")?.remove(); }
    $("stCard").classList.toggle("paired", pair); $("stCard").classList.toggle("prose", cur.classList.contains("prose"));
    $("stage").className = "stage lang-" + lang;
    const eye = cur.dataset.round || ""; $("stEye").textContent = eye; $("stEye").hidden = !eye;
    // the empowerment shows the figure chosen on the console; elsewhere the verse's own figure
    const jen = !!cur.dataset.jen, f = jen ? (pickId && !cur.classList.contains("prose") ? figure(pickId) : null) : figOf(scr);
    const art = !!(f && f.img);
    $("stCard").classList.toggle("has-art", art); $("stArt").hidden = !art; $("stFig").hidden = !f;
    if (f) {
      if (art && !$("stImg").src.endsWith(f.img)) { $("stImg").classList.add("loading"); $("stImg").src = f.img; $("stBg").style.backgroundImage = $("stAv").style.backgroundImage = `url("${f.img}")`; }
      $("stImg").alt = $("stName").textContent = figName(f);
      $("stNo").textContent = jen ? cur.dataset.jlab : [w("fig", { n: f.n, N: f.N }), cur.dataset.rnd].filter(Boolean).join(" · ");
    }
    const nf = jen ? null : figOf(scr + 1), nv = document.querySelector(`.v[data-scr="${scr + 1}"]`), nx = [el("small", "", w("next"))];
    if (nf) { if (nf.img) { const im = el("img", "th"); im.alt = ""; im.src = nf.img; nx.push(im); } nx.push(document.createTextNode(figName(nf))); }   // also preloads her picture
    else if (nv) { const l = nv.querySelector(".l"); nx.push(document.createTextNode(((l && (l.querySelector(".lp") || l).textContent) || "").trim())); }
    $("stNext").className = "next " + lang; $("stNext").replaceChildren(...nx); $("stNext").hidden = !SHOW_NEXT || nx.length < 2;
    fitStage();
    if (moved && !calm) { const c = $("stCard"); c.classList.remove("in"); void c.offsetWidth; c.classList.add("in"); }
  }
  $("stImg").onload = $("stImg").onerror = () => $("stImg").classList.remove("loading");
  $("stFig").onclick = () => $("stCard").classList.contains("compact") && $("stArt").onclick();
  $("stArt").onclick = () => { $("lbImg").src = $("stImg").src; $("lbTxt").textContent = [$("stNo").textContent, $("stName").textContent].filter(Boolean).join(" — "); $("lb").hidden = false; };
  $("lb").onclick = () => { $("lb").hidden = true; };
  const moreHint = () => { const st = $("stage"); st.classList.toggle("more", st.scrollTop + st.clientHeight < st.scrollHeight - 6); };
  $("stage").addEventListener("scroll", moreHint, { passive: true });
  // Fit: the words at Live size, shrinking towards the full text's size; "Next" gives way first; the picture gets the
  // room left (≥ 170 px) or becomes a round portrait beside the name; only then does the card scroll.
  function fitStage() {
    const st = $("stage"), card = $("stCard"), art = card.classList.contains("has-art"), cw = card.clientWidth;
    let k = opts.size, ih = 0; card.classList.remove("compact");
    const put = () => { st.style.setProperty("--k", k); st.style.setProperty("--ih", ih + "px"); }; put();
    const room = () => st.clientHeight - 26 - ($("stNext").hidden ? 0 : $("stNext").offsetHeight + 14);
    const lo = opts.size * 0.83;
    for (let i = 0; i < 6 && card.offsetHeight > room() && k > lo; i++) { k = Math.max(lo, k * (room() / card.offsetHeight) * 0.98); put(); }
    if (card.offsetHeight > room()) $("stNext").hidden = true;
    if (art) {
      const free = room() - card.offsetHeight + 30, max = Math.round(Math.min(cw * 4 / 3, 460));
      if (free >= 170) { ih = Math.min(max, free); put();
        for (let i = 0; i < 4 && card.offsetHeight > room() && ih > 170; i++) { ih = Math.max(170, ih - (card.offsetHeight - room()) - 2); put(); } }
      if (free < 170 || card.offsetHeight > room()) { ih = 0; put(); card.classList.add("compact"); }
    }
    if (card.classList.contains("compact") || !art) for (let i = 0; i < 4 && card.offsetHeight > room() && k > lo * 0.9; i++) { k = Math.max(lo * 0.9, k * (room() / card.offsetHeight) * 0.99); put(); }
    st.scrollTop = 0; moreHint();
  }

  /* ── the whole text, built once per language ── */
  function lineEl(l, i) {
    const d = el("div", "l"); d.dataset.i = i;
    const bo = clean(l.bo);
    if (lang === "bo") { if (!bo) return null; fillIn(d, bo, false, "bo"); return d; }
    const ph = ((lang === "en" ? l.tr : l.trz) || "").trim();
    if (bo) { const b = fillIn(el("div", "lb"), bo, false, "bo"); b.lang = "bo"; d.appendChild(b); }
    if (ph) d.appendChild(fillIn(el("div", "lp"), ph, lang === "zh", lang === "en" ? "tr" : "trz"));
    else if (bo) d.classList.add("only-bo");
    else return null;
    return d;
  }
  const tib = (x) => { const e = el("div", "b", x); e.lang = "bo"; return e; };
  function note(r) {
    const n = el("div", "note");
    if (r.bo) { const b = el("span", "nb", r.bo); b.lang = "bo"; n.appendChild(b); }
    const t = lang === "zh" ? r.zh || r.en : lang === "en" ? r.en : "";
    if (t) n.appendChild(document.createTextNode(t));
    return n.childNodes.length ? n : null;
  }
  function heading(cls, t) { const h = el("div", cls); if (t.bo) h.appendChild(tib(t.bo)); if (lang !== "bo") h.appendChild(el("div", "e", title(t))); return h; }
  function build() {
    const doc = $("doc"); doc.replaceChildren(); doc.className = "lang-" + lang;
    const order = [...P.sections.filter((s) => !s.anytime), ...P.sections.filter((s) => s.anytime && !s.card && shown(s))];
    for (const s of order) {
      const h = heading("sec-h", s.title); h.id = "s" + s.idx; doc.appendChild(h);
      for (let k = s.firstScr; k <= s.lastScr; k++) {
        const sc = P.screens[k], first = P.lines[sc.first];
        const pt = s.parts.find((p) => p.first === sc.first);
        if (pt && pt.first !== s.first) doc.appendChild(heading("part-h", pt.title));
        (first.before || []).forEach((r) => { const n = note(r); if (n) doc.appendChild(n); });
        const f = figOf(k);
        if (f) { const fh = el("div", "fig-h"), tt = el("span");
          if (f.img) { const im = el("img"); im.src = f.img; im.alt = ""; im.loading = "lazy"; im.decoding = "async"; fh.appendChild(im); }
          tt.append(el("small", "", w("fig", { n: f.n, N: f.N })), el("b", "", figName(f))); fh.appendChild(tt); doc.appendChild(fh); }
        const L = P.lines.slice(sc.first, sc.last + 1);
        const v = el("div", L.every((l) => l.kind === "vis" || l.kind === "talk") ? "v prose" : "v"); v.dataset.scr = k;   // read, not chanted
        L.forEach((l, j) => { const d = lineEl(l, sc.first + j); if (d) v.appendChild(d); });
        if (lang !== "bo") {
          const t = dedupe(L.map((l) => ((lang === "zh" ? l.zh : l.en) || "").trim()));
          if (t.length) { const d = el("div", "t"); t.forEach((x, n) => { if (n) d.appendChild(el("br")); fillIn(d, x, false, lang === "zh" ? "zh" : "en"); }); v.appendChild(d); }
        }
        if (v.childNodes.length) doc.appendChild(v);
        (P.lines[sc.last].after || []).forEach((r) => { const n = note(r); if (n) doc.appendChild(n); });
      }
    }
    const run = P.sections.filter((s) => !s.anytime);
    P.span = run.length ? [run[0].first, run[run.length - 1].last] : [0, 1];
    cur = null; buildToc(); B.classList.remove("staged"); $("stage").hidden = true;
  }
  function head(a, b) { $("hTitle").textContent = a; $("hPrayer").textContent = b; }
  const eventName = () => tx(P.event), practiceName = () => tx(P.practice);
  async function setLang(l) {
    store.set("lang", l); hans = l === "zhs"; lang = hans ? "zh" : l; $("welcome").hidden = true;
    if (hans) await loadT2S();
    forLang();
    root.lang = lang === "bo" ? "bo" : lang === "zh" ? (hans ? "zh-Hans" : "zh-Hant") : "en";
    head(eventName(), practiceName());
    words(); build(); applyOpts(); lastShown = null; if (raw) show(raw); wake();
  }

  /* ── sections marked "reveal" (e.g. an empowerment) show only in the hall, and only while the console has them open ── */
  let opened = "", pickId = null, jenSince = 0, jenSeen = false, thxT = 0;
  const shown = (s) => !s.reveal || opened.split(",").includes(s.id);
  function reveal(m) {
    const want = where !== "hall" ? "" : P.sections.filter((s) => s.reveal && Array.isArray(m.open) && m.open.includes(s.id)).map((s) => s.id).join();
    const tp = typeof m.tara === "string" ? m.tara : "";
    if (want && !opened) { jenSince = Date.now(); jenSeen = false; }
    if (!want && opened && jenSeen && Date.now() - jenSince > 120e3) thanks();     // closed after ≥ 2 min that this phone followed
    if (want !== opened || tp !== pickId) { opened = want; pickId = tp; Fill.pick = findFigure(P, tp); build(); lastShown = null; }
  }
  function thanks() {
    words(); $("thxHome").textContent = appMode() ? w("thxApp") : "";
    $("thx").hidden = false; clearTimeout(thxT); thxT = setTimeout(() => ($("thx").hidden = true), 60000);
  }

  /* ── contents ── */
  function tocItem(s, n) {
    const li = el("li"), b = el("button"), tt = el("span"); b.dataset.s = s.idx; if (n === "◆") b.dataset.r = 1;
    const bo = el("span", "b", s.title.bo); bo.lang = "bo"; tt.appendChild(bo);
    if (lang !== "bo") tt.appendChild(el("span", "e", title(s.title)));
    b.append(el("span", "n", n), tt, el("span", "now"));
    b.onclick = () => { openSheet(null); jump(s.idx); };
    li.appendChild(b); return li;
  }
  function buildToc() {
    const ol = $("tocList"); ol.replaceChildren(); let n = 0;
    P.sections.filter((s) => s.reveal && shown(s)).forEach((s) => ol.appendChild(tocItem(s, "◆")));
    P.sections.filter((s) => !s.anytime).forEach((s) => {
      if (s.group) ol.appendChild(el("li", "grp", s.group === "After the puja" ? w("afterPuja") : s.group));
      ol.appendChild(tocItem(s, ++n));
    });
  }
  function paintToc() {
    let on = null;
    const run = P.sections.filter((s) => !s.anytime).map((s) => s.idx), at = run.indexOf(liveSec);
    $("tocList").querySelectorAll("button").forEach((b) => {
      const is = +b.dataset.s === liveSec, k = run.indexOf(+b.dataset.s);
      b.classList.toggle("done-s", at > 0 && k >= 0 && k < at); b.classList.toggle("on", is);
      b.querySelector(".n").textContent = b.dataset.r ? "◆" : at > 0 && k >= 0 && k < at ? "✓" : k + 1;
      b.querySelector(".now").textContent = is ? w("liveNow") : ""; if (is) on = b;
    });
    if (on) requestAnimationFrame(() => { $("toc").scrollTop = on.offsetTop - $("toc").clientHeight / 2; });
  }
  function jump(idx) {
    if (idx === liveSec && cur) return backToLive();
    const h = $("s" + idx); if (!h) return;
    if (view === "live") { view = "text"; store.set("view", view); paintView(); }
    follow = false; $("follow").classList.add("on");
    scrollTo({ top: Math.max(0, scrollY + h.getBoundingClientRect().top - 72), behavior: calm ? "auto" : "smooth" });
    setTimeout(pillDir, 500);
  }

  /* ── following the console ── */
  function recenter(instant) {
    if (!cur || !follow) return;
    const y = scrollY + cur.getBoundingClientRect().top - innerHeight * 0.28;   // the live verse sits a little above the middle
    scrollTo({ top: Math.max(0, y), behavior: instant || calm || B.classList.contains("staged") ? "auto" : "smooth" });   // hidden behind Live: no animation
  }
  let waits = 0, waiting = false, browsing = -1;
  function show(m) {
    if (!P || !lang) return;
    reveal(m);
    const line = m.set && !m.test ? P.lines[m.index] : null;   // test = the console is rehearsing: phones wait
    const sec = line && P.sections[line.sIdx];
    if (line && !shown(sec)) {                    // a section hidden from this phone: stay where we were
      onAir = false; paintView();
      if (waiting) { waiting = false; $("waiting").hidden = true; }
      if (!cur) head(eventName(), practiceName());
      lastShown = null; return;
    }
    // before the start, or on Break: a calm full screen (which the reader may put aside to read)
    const wait = !line || !!sec.card;
    if (wait && !waiting) waits++;
    waiting = wait;
    $("waiting").hidden = !wait || browsing === waits;
    onAir = !!line; paintLive();
    if (wait) {
      $("waitWord").textContent = !line ? eventName() : tx(sec.title);
      $("waitWord").className = "word " + lang;
      const bl = line && typeof m.bookmark === "number" ? P.lines[m.bookmark] : null, bs = bl && P.sections[bl.sIdx];
      $("waitSub").textContent = !line ? w("beginSoon") : bs && !bs.card ? w("afterBreak", { s: tx(bs.title) }) : "";
      head(eventName(), !line ? practiceName() : tx(sec.title));
      paintWait(bs && !bs.card ? bs : null); paintView(); paintBack();
      lastShown = null; return;
    }
    liveSec = sec.idx;
    const part = line.pi >= 0 ? sec.parts[line.pi] : null;
    const rep = part ? +(part.rep || 0) : 0;
    const rnd = (sec.loop || rep) && m.round ? w("round", { n: m.round }) : "";
    const jen = !!sec.reveal;
    const jrep = !jen || !rep ? "" : m.round ? w("repOf", { n: Math.min(m.round, rep), N: rep }) : w("repX", { N: rep });
    if (jen) jenSeen = true;
    const f = sec.loop ? figOfLine(line) : null, pos = f ? w("fig", { n: f.n, N: f.N }) : "";
    head(tx(sec.title), [part ? tx(part.title) : "", rnd].filter(Boolean).join(" · ") || pos);
    if (!sec.anytime) $("progBar").style.width = Math.max(1, Math.min(100, ((m.index - P.span[0]) / Math.max(1, P.span[1] - P.span[0])) * 100)) + "%";
    const key = line.scr + "|" + m.index + "|" + m.mode + "|" + rnd;
    if (key === lastShown) return paintView();
    lastShown = key;
    const was = cur, v = document.querySelector(`.v[data-scr="${line.scr}"]`);
    if (!v) return;
    if (cur !== v) {
      document.querySelectorAll(".v.cur").forEach((x) => x.classList.remove("cur"));
      document.querySelectorAll(".v").forEach((x) => x.classList.toggle("past", +x.dataset.scr < line.scr && P.screens[+x.dataset.scr].sIdx === line.sIdx));
      document.querySelectorAll(".v.nx").forEach((x) => x.classList.remove("nx"));
      const nx = document.querySelector(`.v[data-scr="${line.scr + 1}"]`); if (nx && P.screens[line.scr + 1].sIdx === line.sIdx) nx.classList.add("nx");
      if (cur) { delete cur.dataset.round; v.classList.remove("fresh"); void v.offsetWidth; v.classList.add("fresh"); }
      v.classList.add("cur"); cur = v; recenter(false);
    }
    counted(sec, line, m.round);
    B.classList.toggle("line", m.mode === "line");
    const lab = jen ? (line.kind ? w("k_" + line.kind) : [w("repeatAfter"), jrep].filter(Boolean).join(" · "))
                    : [f ? f.n + " / " + f.N : "", rnd].filter(Boolean).join(" · ");
    v.dataset.round = lab; v.dataset.rnd = rnd; v.dataset.jen = jen ? jrep || "-" : ""; v.dataset.jlab = jen ? lab : "";
    v.querySelectorAll(".l").forEach((d) => d.classList.toggle("dim", +d.dataset.i !== m.index));
    paintView(); if (!$("stage").hidden) paintStage(was !== v && !!was);
    pillDir();
  }
  function figOfLine(line) {                       // the figure of the verse this line belongs to
    for (let i = P.screens[line.scr].first; i >= 0; i--) {
      const l = P.lines[i]; if (l.sIdx !== line.sIdx || l.pi !== line.pi || l.v !== line.v) break;
      if (l.tara) return figure(l.tara);
    }
    return null;
  }
  $("readBtn").onclick = () => { browsing = waits; $("waiting").hidden = true; if (view === "live") { view = "text"; paintView(); } };
  function paintWait(next) {                      // Break / before the start: how far the puja has come, the mantra, my rounds today
    const run = P.sections.filter((s) => !s.anytime), at = next ? run.indexOf(next) : -1;
    $("steps").replaceChildren(...run.map((s, k) => el("i", k < at ? "d" : k === at ? "c" : "")));
    $("stepsTxt").textContent = at >= 0 ? w("stepOf", { n: at + 1, N: run.length }) : "";
    const mt = P.mantra; $("mantra").hidden = !mt;
    if (mt) {
      $("mantraT").textContent = tx(mt.label); $("mantraB").textContent = mt.bo || "";
      const mp = $("mantraP"); mp.hidden = lang === "bo"; mp.className = "mp" + (lang === "zh" ? " zh" : "");
      mp.textContent = lang === "zh" ? mt.trz || mt.tr || "" : mt.tr || "";
    }
    const r = recite(); $("mineT").hidden = !r.today; $("mineT").textContent = r.today ? w("mineToday", { d: r.today, name: loopName() }) : "";
  }

  // My recitations: a round of a "loop" section counts once this phone has followed ≥ 3 of its screens and reached
  // its last one. Kept on the phone only — nothing is sent anywhere.
  let seen = null;
  const today = () => new Date().toLocaleDateString("en-CA");
  const loopName = () => { const s = P && P.sections.find((x) => x.loop); return s ? tx(s.title) : "—"; };
  function recite() { const r = store.get("recite", {}); return { today: r.day === today() ? r.today || 0 : 0, all: r.all || 0 }; }
  function counted(sec, line, round) {
    if (!sec.loop) { seen = null; return; }
    if (!seen || seen.round !== round || seen.sec !== sec.idx) seen = { round, sec: sec.idx, scr: new Set(), done: false };
    seen.scr.add(line.scr);
    if (seen.done || line.scr !== sec.lastScr || seen.scr.size < Math.min(3, sec.lastScr - sec.firstScr + 1)) return;
    seen.done = true;
    const r = recite(), n = { day: today(), today: r.today + 1, all: r.all + 1 };
    store.set("recite", n); applyOpts(); toast(w("recited", { d: n.today, name: loopName() }));
  }
  let toastT = 0;
  function toast(t) { $("toast").textContent = t; $("toast").hidden = false; clearTimeout(toastT); toastT = setTimeout(() => ($("toast").hidden = true), 5000); }

  // a notice from the organisers: shown until closed (a new notice shows again); never delayed for online readers
  let notice = "", back = 0;
  function paintMsg() {
    const on = !!notice && notice !== store.get("closedMsg", "");
    $("msg").hidden = !on; B.classList.toggle("hasmsg", on); $("msgTxt").textContent = notice; $("msgX").setAttribute("aria-label", w("close"));
  }
  $("msgX").onclick = () => { store.set("closedMsg", notice); paintMsg(); };
  $("msgTxt").onclick = () => $("msg").classList.toggle("open");
  function paintBack() {                          // Break: when we resume, in the phone's own time zone
    let t = "";
    if (back && waiting) {
      const at = back + skew, n = Math.ceil((at - Date.now()) / 60000);
      t = n > 0 ? w("backAt", { t: new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), n }) : w("backSoon");
    }
    if ($("waitBack").textContent !== t) $("waitBack").textContent = t;
    $("waitBack").hidden = !t;
  }

  // Every position the console sends is kept ~2½ minutes with the moment it happened, so an online reader sees the
  // verse that was live `delay` seconds ago — also straight after opening or reconnecting (the server sends `hist`).
  let skew = 0, heard = [];                      // skew = this phone's clock − the server's
  let soonV = null, soonT = 0, reloadBase = null, reloadT = 0;
  function learn(m) {
    if (typeof m.now === "number") skew = Date.now() - m.now;
    const at = (t) => (typeof t === "number" ? t + skew : Date.now());
    if (Array.isArray(m.hist)) heard = m.hist.map(([t, s]) => [at(t), s]);
    heard.push([at(m.t), m]); heard.sort((a, b) => a[0] - b[0]);
    const cut = Date.now() - 150e3; while (heard.length > 1 && heard[1][0] <= cut) heard.shift();
    if (typeof m.delay === "number" && m.delay !== hint) { hint = m.delay; applyOpts(); }
    if (typeof m.msg === "string" && m.msg !== notice) { notice = m.msg; if (!notice) store.set("closedMsg", ""); paintMsg(); }
    if (typeof m.back === "number") back = m.back;
    if (m.yt && typeof m.yt === "object" && JSON.stringify(m.yt) !== JSON.stringify(yt)) { yt = m.yt; paintYt(); }
    if (typeof m.reload === "number") {          // "Refresh all phones": reload once, spread over 20 s
      if (reloadBase === null) reloadBase = m.reload;
      else if (m.reload > reloadBase && !reloadT) reloadT = setTimeout(() => location.reload(), Math.random() * 20000);
    }
    if (m.pv && P && m.pv !== textV && m.pv !== soonV) {   // prayers.json was edited: fetch it within a minute, not all at once
      soonV = m.pv; clearTimeout(soonT); soonT = setTimeout(() => refreshText(soonV), Math.random() * 60000);
    }
    tick();
  }
  // "▶ YouTube" only for online readers: the live in their language, else the channel's live streams
  function paintYt() {
    const ok = (s) => /^[\w-]+$/.test(s || ""), any = [yt.en, yt.zh, yt.bo].find(ok), a = $("ytLink");
    a.hidden = where !== "online" || !any; if (!any) return;
    a.href = ok(yt[lang]) ? "https://www.youtube.com/watch?v=" + yt[lang] : ok(yt.ch) ? "https://www.youtube.com/channel/" + yt.ch + "/streams" : "https://www.youtube.com/watch?v=" + any;
  }
  function tick() {
    const due = Date.now() - delay() * 1000;
    let m = null; for (const [at, s] of heard) { if (at <= due) m = s; else break; }
    if (m && m !== raw) { raw = m; show(m); }
    paintBack();
  }
  setInterval(tick, 250);
  function newPage() {                            // prayers.json asks for a newer page than this one: reload once
    const want = +(P0 && P0.viewer) || 0; if (want <= PAGE_V) return false;
    try { if (sessionStorage.getItem(PREFIX + "reloadedFor") === String(want)) return false; sessionStorage.setItem(PREFIX + "reloadedFor", String(want)); } catch { return false; }
    location.reload(); return true;
  }
  let refreshing = false;
  async function refreshText(v) {
    if (refreshing) return; refreshing = true;
    try { P0 = await Prayers.loadPrayers("prayers.json?v=" + v, "default"); if (newPage()) return; if (hans) { T2S = new Map(); await loadT2S(); }
      forLang(); textV = v; build(); lastShown = null; if (raw) show(raw); }
    catch { soonV = null; }                      // the next message tries again
    refreshing = false;
  }

  /* ── wandering off: the pill says how far, and brings the reader back ── */
  function readingAt() {
    const y = innerHeight * 0.28; let best = null, gap = Infinity;
    for (const v of document.querySelectorAll(".v")) {
      const r = v.getBoundingClientRect(), d = r.top > y ? r.top - y : r.bottom < y ? y - r.bottom : 0;
      if (d < gap) { gap = d; best = v; } if (r.top > y + innerHeight) break;
    }
    return best;
  }
  function pillDir() {
    if (!cur || follow) return;
    const all = [...document.querySelectorAll(".v")], at = readingAt(), n = at ? all.indexOf(cur) - all.indexOf(at) : 0;
    const b = $("follow"), lab = (cur.getBoundingClientRect().top < 0 ? "↑ " : "↓ ") + w("follow"), far = n ? w(n > 0 ? "behind" : "ahead", { n: Math.abs(n) }) : "";
    if (b.dataset.lab === lab + far) return; b.dataset.lab = lab + far;
    b.replaceChildren(document.createTextNode(lab)); if (far) b.appendChild(el("small", "", far));
  }
  let settleT = 0;
  function settled() { if (!follow && cur && view !== "live" && readingAt() === cur) { follow = true; $("follow").classList.remove("on"); } }   // caught up by hand
  for (const ev of ["wheel", "touchmove"]) addEventListener(ev, (e) => {
    if (!cur || view === "live" || e.target.closest?.(".sheet, .cover, .tabs, .stage, .guide, .thx, .appcard, .msg, .toast, .zbox")) return;
    if (follow) { follow = false; $("follow").classList.add("on"); } pillDir();
  }, { passive: true });
  addEventListener("scroll", () => { if (!follow) { pillDir(); clearTimeout(settleT); settleT = setTimeout(settled, 1500); } }, { passive: true });
  function backToLive() { follow = true; $("follow").classList.remove("on"); recenter(false); }
  $("follow").onclick = backToLive;
  addEventListener("resize", () => { recenter(true); if (P) paintView(); });

  /* ── keep the screen awake while following ── */
  let lock = null;
  async function wake() { try { if ("wakeLock" in navigator && !lock && document.visibilityState === "visible") { lock = await navigator.wakeLock.request("screen"); lock.onrelease = () => { lock = null; }; } } catch {} }
  addEventListener("click", wake, { once: true });

  /* ── the app: this page on the Home Screen ──
     Android: the browser's own install prompt. iPhone: the steps for Safari, with an arrow at the button. Inside
     WeChat/WhatsApp/Facebook… a page can't be installed at all: first out to the real browser. */
  const UA = navigator.userAgent, IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const IPHONE = /iPhone|iPod/.test(UA), AND = /Android/.test(UA), WECHAT = /MicroMessenger/i.test(UA);
  const INAPP = /FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|WhatsApp|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|Telegram|; wv\)/i.test(UA) || (IOS && !/Safari\//.test(UA));
  const SAMSUNG = AND && /SamsungBrowser/.test(UA), CHROME_A = AND && /Chrome\//.test(UA) && !/SamsungBrowser|EdgA|OPR\/|Firefox|MiuiBrowser|HeyTap|VivoBrowser|UCBrowser|YaBrowser|HuaweiBrowser/.test(UA);
  const SAFARI = IOS && !INAPP && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(UA), SV = +(UA.match(/Version\/(\d+)/) || [])[1] || 0;
  const isApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let askBox = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); askBox = e; paintApp(); });
  addEventListener("appinstalled", () => { askBox = null; store.set("appDone", true); $("appCard").hidden = true; openSheet(null); toast(w("installed")); paintApp(); });
  function appMode() {                            // which help this phone needs; "" = none (already the app, or a computer)
    if (isApp() || (store.get("appDone", false) && !IOS)) return "";
    if (INAPP) return "inapp"; if (askBox) return "prompt";
    if (IOS) return !SAFARI ? "iosx" : IPHONE && SV >= 26 ? "ios26" : "ios";
    return !AND ? "" : SAMSUNG ? "andS" : CHROME_A ? "and" : "andX";
  }
  const ICON = { dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
    vdots: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16"/>',
    add: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17"/>' };
  const STEPS = { ios26: [["dots", "st1Dots"], ["share", "stShare"], ["add", "stAdd"], ["ok", "stAddDone"]],
    ios: [["share", IPHONE ? "st1Share" : "st1ShareAny"], ["add", "stAdd"], ["ok", "stAddDone"]], iosx: [["share", "st1ShareAny"], ["add", "stAdd"], ["ok", "stAddDone"]],
    and: [["vdots", "stAndMenu"], ["add", "stAndAdd"], ["ok", "stAndDone"]], andS: [["menu", "stSamMenu"], ["add", "stSamAdd"], ["ok", "stSamDone"]],
    andX: [["vdots", "stAnyMenu"], ["add", "stAndAdd"], ["ok", "stAnyDone"]], inapp: [["dots", "stAppMenu"], ["globe", "stAppOpen"], ["add", "stAppThen"]] };
  const COACH = { ios26: "br", ios: IPHONE ? "bc" : "", and: "tr", andS: "br", inapp: "tr" };   // where the browser's button is
  function paintApp() { $("setApp").hidden = !appMode(); }
  function homeTip() { $("gHome").hidden = !appMode(); $("gHomeT").textContent = w("gApp"); }
  function openInst() {
    const m = appMode(); if (!m) return;
    $("appCard").hidden = true; words();
    $("iTitle").textContent = w(m === "inapp" ? "iInT" : "iTitle"); $("iSub").textContent = m === "inapp" ? w("iInS") : w("iSub");
    $("iName").textContent = P ? tx(P.event) : document.title;
    $("iPerks").replaceChildren(...(m === "inapp" ? [] : ["iP1", "iP2", "iP3"].map((k) => el("li", "", w(k)))));
    const chrome = m === "inapp" && AND && !WECHAT;
    $("iGo").hidden = m !== "prompt" && !chrome; $("iGo").textContent = w(chrome ? "iChrome" : "iInstall");
    const ol = $("iSteps"); ol.replaceChildren(); ol.hidden = m === "prompt";
    if (m !== "prompt") {
      ol.appendChild(el("h5", "", w("iHow")));
      STEPS[m].forEach(([ic, k], i) => { const li = el("li"), c = el("span", "ic" + (ic === "ok" ? " ok" : ""));
        c.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[ic]}</svg>`; li.append(el("i", "", i + 1), c, el("span", "", w(k))); ol.appendChild(li); });
    }
    $("iShow").hidden = !COACH[m]; $("iCopy").hidden = m !== "inapp";
    if (IOS && m !== "inapp") carry();
    openSheet("inst");
  }
  function carry() {
    try { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIX)) o[k.slice(PREFIX.length)] = localStorage.getItem(k); }
      history.replaceState(null, "", location.pathname + "?k=" + encodeURIComponent(JSON.stringify(o))); } catch {}
  }
  let coachT = 0, coachAt = 0;
  function coach() {
    const m = appMode(), pos = COACH[m]; if (!pos) return;
    openSheet(null); $("coachT").textContent = w(STEPS[m][0][1]); $("coach").className = "coach " + pos; $("coach").hidden = false; B.classList.add("coaching");
    clearTimeout(coachT); coachT = setTimeout(uncoach, 15000);
  }
  function uncoach() { $("coach").hidden = true; B.classList.remove("coaching"); }
  addEventListener("pointerdown", () => { if (!$("coach").hidden && Date.now() - coachAt > 600) uncoach(); });
  $("iShow").onclick = () => { coachAt = Date.now(); coach(); };
  $("iGo").onclick = async () => {
    if (askBox) { const a = askBox; askBox = null; a.prompt(); try { const r = await a.userChoice; if (r.outcome !== "accepted") paintApp(); } catch {} return; }
    location.href = "intent://" + location.host + location.pathname + "#Intent;scheme=https;package=com.android.chrome;end";
  };
  $("iCopy").onclick = async () => {
    const u = location.origin + location.pathname;
    try { await navigator.clipboard.writeText(u); } catch { const t = el("textarea"); t.value = u; B.appendChild(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove(); }
    toast(w("iCopied"));
  };
  $("setApp").onclick = openInst;
  $("gHomeT").onclick = () => { $("guide").hidden = true; store.set("guided", true); openInst(); };
  $("thxHome").onclick = () => { if (appMode()) { $("thx").hidden = true; openInst(); } };
  // the card asks after 3 minutes of following (20 s in an in-app browser); "Not now" → a day, then 3 days, then never
  let seenS = 0;
  const cardFree = () => ["welcome", "whereCover", "guide", "thx", "lb", "sheet", "toc", "inst"].every((id) => $(id).hidden) && $("coach").hidden;
  function maybeCard() {
    const m = appMode(), no = store.get("appNo", { n: 0, at: 0 }), wait = [0, 864e5, 3 * 864e5][no.n];
    if (!m || !$("appCard").hidden || wait === undefined || Date.now() - no.at < wait || seenS < (m === "inapp" ? 20 : 180) || !cardFree()) return;
    words(); const inapp = m === "inapp";
    $("acT").textContent = w(inapp ? "acInT" : "acT"); $("acS").textContent = w(inapp ? "acInS" : "acS");
    $("acYes").textContent = w(m === "prompt" ? "iInstall" : "acYes"); $("appCard").classList.toggle("top", inapp); $("appCard").hidden = false;
  }
  setInterval(() => { if (!document.hidden && link === "live") { seenS += 5; maybeCard(); } }, 5000);
  $("acNo").onclick = () => { const no = store.get("appNo", { n: 0, at: 0 }); store.set("appNo", { n: no.n + 1, at: Date.now() }); $("appCard").hidden = true; };
  $("acYes").onclick = () => { if (appMode() === "prompt") $("iGo").onclick(); else openInst(); $("appCard").hidden = true; };
  if (isApp() && !store.get("appHi", false)) { store.set("appHi", true); setTimeout(() => toast(w("appHi")), 2500); }
  paintApp();

  /* ── connection ──
     EventSource retries by itself but gives up for good on an error page (e.g. the tunnel answering while the server
     restarts). Then we retry with backoff and jitter. A line silent for over 70 s (heartbeat every 25 s) is reopened. */
  let es = null, retryT = 0, tries = 0, heardAt = 0, beats = false, pillT = 0;
  function device() {                             // a random id kept on this phone: lets the console count phones
    let id = store.get("id", null);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); store.set("id", id); }
    return id;
  }
  function conn(s) {                              // "live" | "connecting" | "reconnecting" | "offline"
    link = s; paintLive(); clearTimeout(pillT);
    if (s === "live") { $("status").hidden = true; return; }
    $("status").textContent = w(s);
    pillT = setTimeout(() => ($("status").hidden = link === "live"), s === "offline" ? 0 : 1500);   // no flash on a quick reconnect
  }
  function paintLive() {
    $("live").classList.toggle("on", link === "live" && onAir); $("live").classList.toggle("off", link !== "live");
    $("liveTxt").textContent = w("live");
  }
  function connect() {
    clearTimeout(retryT); if (es) es.close();
    if (link !== "live") conn(navigator.onLine === false ? "offline" : tries ? "reconnecting" : "connecting");
    es = new EventSource("events?" + new URLSearchParams({ id: device(), lang: choice() || "", where: where || "", ...(isApp() ? { app: 1 } : {}) }));
    es.onmessage = (e) => { heardAt = Date.now(); tries = 0; conn("live"); try { learn(JSON.parse(e.data)); } catch {} };
    es.addEventListener("hb", () => { heardAt = Date.now(); beats = true; });
    es.onerror = () => { conn(navigator.onLine === false ? "offline" : "reconnecting"); if (es.readyState === EventSource.CLOSED) later(); };
  }
  function later() {
    clearTimeout(retryT);
    if (document.hidden) return;                  // retried when the page is looked at again
    retryT = setTimeout(connect, Math.min(30000, 2000 * 2 ** tries++) * (0.5 + Math.random()));
  }
  function reconnect() { if (es) connect(); }
  const quiet = () => beats && Date.now() - heardAt > 70000;
  const stale = () => heardAt && Date.now() - heardAt > 35000;
  setInterval(() => { if (es && es.readyState === EventSource.OPEN && quiet()) connect(); }, 10000);
  // phones often keep a dead line open in the background: back in view with nothing heard for 35 s → a fresh one now
  document.addEventListener("visibilitychange", () => { if (document.hidden) return; wake(); if (es && (es.readyState === EventSource.CLOSED || quiet() || stale())) connect(); });
  addEventListener("pageshow", (e) => { if (e.persisted && es) connect(); });
  addEventListener("online", () => { if (es && es.readyState !== EventSource.OPEN) connect(); });
  addEventListener("offline", () => conn("offline"));

  /* ── start screens: language, then where from — the first time, and again from the title at the top ── */
  let revisiting = false, startLang = null;
  function mark() {
    document.querySelectorAll("#welcome .langs button").forEach((b) => { const on = revisiting && b.dataset.l === choice(); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("#whereCover .places button").forEach((b) => { const on = revisiting && b.dataset.w === where; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $("welcomeBack").hidden = $("whereBack").hidden = !revisiting;
  }
  function home() { if (!P) return; openSheet(null); revisiting = true; startLang = choice(); words(); mark(); $("welcome").hidden = false; }
  function closeStart() { $("welcome").hidden = $("whereCover").hidden = true; revisiting = false; mark(); }
  function askWhere() { words(); mark(); $("whereCover").hidden = false; }
  $("homeBtn").onclick = home;
  $("welcomeBack").onclick = $("whereBack").onclick = closeStart;
  document.querySelectorAll("#welcome .langs button").forEach((b) => (b.onclick = async () => {
    if (b.dataset.l !== choice()) await setLang(b.dataset.l); else $("welcome").hidden = true;
    if (!where || revisiting) askWhere(); else connect();
  }));
  document.querySelectorAll("#whereCover .places button").forEach((b) => (b.onclick = () => {
    const changed = b.dataset.w !== where || choice() !== startLang;
    where = b.dataset.w; store.set("where", where); closeStart(); applyOpts(); rewhere(); tick();
    if (!es || changed) connect();               // the console's counts follow the new language / place
    wake();
    if (!store.get("guided", false)) { words(); homeTip(); $("guide").hidden = false; }
  }));
  $("thxOk").onclick = () => { $("thx").hidden = true; setView("live"); };
  $("gOk").onclick = () => { $("guide").hidden = true; store.set("guided", true); };

  (async function start() {
    for (let k = 0; !P0; k++) {
      try { P0 = await Prayers.loadPrayers("prayers.json?v=" + textV, "default"); if (newPage()) return; }
      catch { conn("connecting"); await new Promise((r) => setTimeout(r, Math.min(15000, 1500 * 2 ** k) * (0.5 + Math.random()))); }
    }
    if (hans) await loadT2S();
    forLang();
    document.title = (P0.event.en || "Puja") + " · Follow the prayers";
    $("wBo").textContent = P0.event.bo || ""; $("wEn").textContent = P0.event.en || ""; $("wZh").textContent = P0.event.zh || "";
    words(); applyOpts();
    if (!lang) { head(P0.event.en || "", P0.practice.en || ""); $("welcome").hidden = false; return; }
    await setLang(choice());
    if (!where) askWhere(); else connect();
  })();
})();
