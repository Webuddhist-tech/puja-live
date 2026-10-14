// Shared by the viewer, the console and the OBS overlay: loads prayers.json and works out
//   lines   — every line of every section, flattened, in order (sIdx = its section, pi = its part, or -1)
//   screens — what is shown at once: one verse when its lines are short (up to 4 lines), 2 lines at a time when a
//             line is long (more than LONG Tibetan syllables). Verses longer than that are split into even groups.
// Every page uses the same screens, so the console, phones and the stream overlay always agree.
/* global module */
(function (G) {
  const LONG = 12;

  function syllables(bo) {
    return String(bo || "").replace(/\{[^}]*\}/g, " ").split(/[\s་-༔༺-༽]+/)
      .filter((s) => /[ཀ-ྼ]/.test(s)).length;
  }
  // n lines into groups of at most `max`, as even as possible: 6 → 3+3, 10 → 4+3+3
  function evenGroups(n, max) {
    const k = Math.ceil(n / max), out = [];
    for (let i = 0; i < k; i++) out.push(Math.floor(n / k) + (i < n % k ? 1 : 0));
    return out;
  }
  function screenSizes(lines) {
    const n = lines.length;
    if (!lines.some((l) => syllables(l.bo) > LONG)) return evenGroups(n, 4);
    if (n <= 3) return [n];
    const g = evenGroups(n, 2);                      // pairs; an odd line out joins the last pair (5 → 2+3), never alone
    if (g.length > 1 && g[g.length - 1] === 1) { g.pop(); g[g.length - 1]++; }
    return g;
  }

  // Text written {like this} is said aloud by each person (their name…) and shown small and faint.
  // {key:hint} is filled from the figure chosen on the console (an entry of a section's "taras" list), in the
  // language of the field being shown (bo / tr / en / trz / zh); otherwise the hint is shown.
  const Fill = { pick: null };
  function findFigure(doc, id) {
    if (id == null || id === "") return null;
    for (const s of doc.sections) { const t = (s.taras || []).find((x) => x.id === String(id)); if (t) return t; }
    return null;
  }
  function fillParts(text, field) {
    return String(text ?? "").split(/(\{[^}]*\})/).filter(Boolean).map((p) => {
      const m = /^\{(?:([a-z][a-z0-9]*):)?([^}]*)\}$/.exec(p);
      if (!m) return { t: p };
      const v = m[1] && Fill.pick && Fill.pick[m[1]] && Fill.pick[m[1]][field];
      return typeof v === "string" ? { t: v } : { t: m[2], fill: true };
    });
  }
  // put text into a node; `words` wraps each word in a span (used for Chinese phonetics, one syllable group per span)
  function fillIn(node, text, words, field) {
    const span = (cls, t) => { const s = document.createElement("span"); s.className = cls; s.textContent = t; node.appendChild(s); };
    for (const { t, fill } of fillParts(text, field)) {
      if (fill) { span("fill", t); continue; }
      if (!words) { node.appendChild(document.createTextNode(t)); continue; }
      for (const w of t.split(/(\s+)/)) { if (/^\s+$/.test(w)) node.appendChild(document.createTextNode(" ")); else if (w) span("beat", w); }
    }
    return node;
  }
  function fillText(text, field) { return fillParts(text, field).map((p) => p.t).join(""); }

  function prepare(doc) {
    const lines = [], sections = [], screens = [];
    (doc.sections || []).forEach((s, si) => {
      const sec = { ...s, idx: si, first: lines.length, parts: (s.parts || []).map((p) => ({ ...p })) };
      (s.lines || []).forEach((l, li) => {
        let pi = -1; sec.parts.forEach((p, k) => { if (li >= p.at) pi = k; });
        lines.push({ ...l, sIdx: si, li, pi });
      });
      sec.last = lines.length - 1;
      sec.parts.forEach((p, k) => { p.first = sec.first + p.at; p.last = k + 1 < sec.parts.length ? sec.first + sec.parts[k + 1].at - 1 : sec.last; });
      // a verse = consecutive lines of the same part with the same v; an instruction or a goto between lines ends it
      for (let i = sec.first; i <= sec.last;) {
        let j = i;
        while (j < sec.last && lines[j + 1].pi === lines[i].pi && lines[j + 1].v === lines[i].v
               && !(lines[j + 1].before || []).length && !(lines[j].after || []).length && !lines[j].goto) j++;
        let a = i;
        for (const size of screenSizes(lines.slice(i, j + 1))) {
          const sc = { idx: screens.length, first: a, last: a + size - 1, sIdx: si };
          for (let k = a; k <= sc.last; k++) lines[k].scr = sc.idx;
          screens.push(sc); a += size;
        }
        i = j + 1;
      }
      sec.firstScr = sec.last >= sec.first ? lines[sec.first].scr : screens.length;
      sec.lastScr = sec.last >= sec.first ? lines[sec.last].scr : screens.length - 1;
      sections.push(sec);
    });
    return { lines, sections, screens, event: doc.event || {}, practice: doc.practice || {}, viewer: doc.viewer || 0, mantra: doc.mantra || null };
  }

  async function loadPrayers(url = "prayers.json", cache = "no-store") {
    const res = await fetch(url, { cache });
    if (!res.ok) throw new Error("prayers.json: HTTP " + res.status);
    return prepare(await res.json());
  }

  const api = { LONG, syllables, evenGroups, prepare, loadPrayers, fillIn, fillText, fillParts, findFigure, Fill };
  if (typeof module === "object" && module.exports) module.exports = api; else G.Prayers = api;
})(typeof window !== "undefined" ? window : globalThis);
