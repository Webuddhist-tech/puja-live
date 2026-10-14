"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { prepare, syllables, evenGroups, fillText, Fill } = require("../public/prayers.js");

const line = (bo, v, extra = {}) => ({ bo, tr: "", en: "", v, ...extra });
const short = "ཕྱག་འཚལ་སྒྲོལ་མ་མྱུར་མ་དཔའ་མོ།";                        // 8 syllables
const long = "སེམས་ཅན་ཐམས་ཅད་བདེ་བ་དང་བདེ་བའི་རྒྱུ་དང་ལྡན་པར་གྱུར་ཅིག"; // 15 syllables

test("counts Tibetan syllables, ignoring {fill-ins} and punctuation", () => {
  assert.equal(syllables(short), 8);
  assert.equal(syllables(long), 15);
  assert.equal(syllables("{your name} ཕྱག་འཚལ།"), 2);
});

test("even groups", () => {
  assert.deepEqual(evenGroups(6, 4), [3, 3]);
  assert.deepEqual(evenGroups(10, 4), [4, 3, 3]);
  assert.deepEqual(evenGroups(4, 4), [4]);
});

test("a short verse is one screen; a long verse goes two lines at a time, never one alone", () => {
  const P = prepare({ sections: [
    { id: "a", title: {}, lines: [1, 2, 3, 4].map(() => line(short, 1)) },
    { id: "b", title: {}, lines: [1, 2, 3, 4, 5].map(() => line(long, 1)) },
  ] });
  const sizes = P.screens.map((s) => s.last - s.first + 1);
  assert.deepEqual(sizes, [4, 2, 3]);
  assert.equal(P.sections[1].firstScr, 1);
  assert.equal(P.sections[1].lastScr, 2);
});

test("instructions and gotos end a verse; parts are assigned", () => {
  const P = prepare({ sections: [{ id: "a", title: {}, parts: [{ at: 0, title: {} }, { at: 3, title: {} }], lines: [
    line(short, 1), line(short, 1, { after: [{ en: "bow" }] }), line(short, 1),
    line(short, 1), line(short, 1, { goto: { section: "a" } }), line(short, 1) ] }] });
  assert.deepEqual(P.screens.map((s) => [s.first, s.last]), [[0, 1], [2, 2], [3, 4], [5, 5]]);
  assert.deepEqual(P.lines.map((l) => l.pi), [0, 0, 0, 1, 1, 1]);
});

test("fill-ins use the chosen figure, else show the hint", () => {
  Fill.pick = null;
  assert.equal(fillText("Homage to {name:Tārā}", "en"), "Homage to Tārā");
  Fill.pick = { name: { en: "Swift Heroine" } };
  assert.equal(fillText("Homage to {name:Tārā}", "en"), "Homage to Swift Heroine");
  Fill.pick = null;
});

test("the demo prayers.json loads", () => {
  const doc = require("../data/prayers.json");
  const P = prepare(doc);
  assert.ok(P.lines.length > 0 && P.screens.length > 0);
  for (const l of P.lines) assert.equal(typeof l.scr, "number");
  assert.ok(P.sections.some((s) => s.card), "needs a Break section (card: true)");
});
