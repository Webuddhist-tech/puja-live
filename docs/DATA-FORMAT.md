# `data/prayers.json`

One file holds the whole puja. Edit it while the server is running: phones pick up the new text within a minute, and the console picks it up at once.

```jsonc
{
  "event":    { "bo": "…", "en": "100,000 Tara Puja", "zh": "…" },   // top bar + welcome screen
  "practice": { "bo": "…", "en": "Tara practice", "zh": "…" },      // subtitle before the start
  "viewer": 0,               // set to viewer.js's PAGE_V to reload every open phone once after a page update
  "notice": { "en": "© …", "zh": "…" },                              // optional small print in Settings
  "mantra": { "label": { "en": "Tārā’s mantra" }, "bo": "…", "tr": "om taré…", "trz": "嗡…" },  // Break screen
  "sections": [ … ]
}
```

## Sections

| field | meaning |
|---|---|
| `id` | a stable name, used by `goto`, `open` and `reveal` |
| `title` | `{ bo, en, zh }` |
| `lines` | the text, in order (see below) |
| `parts` | `[{ "at": 0, "title": {…}, "rep": 3 }]`: named prayers inside the section, starting at line `at`. `rep` = said N times (the console's "Again" button, and "2 of 3" on phones) |
| `anytime` | outside the normal order (Break, a tea offering, an empowerment): not numbered in Contents |
| `card` | phones show the calm Break screen instead of text. You need one section with `card: true` for the console's Break button |
| `loop` | repeated in rounds (e.g. the 21 Praises): "Round n", and counted under "My recitations" |
| `reveal` | shown only on phones set to *In the hall*, and only while the console has it open |
| `group` | a label shown above this section in Contents and the console, e.g. `"After the puja"` |
| `taras` | figures for this text: `[{ "id": "1", "img": "images/x.jpg", "name": {bo,en,zh}, "mantra": {bo,tr}, … }]`. Any extra `{bo,tr,en,trz,zh}` field can be used as a fill-in |
| `note` | an operator-only note shown in the console |

## Lines

| field | meaning |
|---|---|
| `bo` | Tibetan |
| `tr` | English phonetics |
| `en` | English translation. Repeat the same sentence on every line of a verse to show it once under the verse; give each line its own sentence to show each one under its line on the Live card |
| `trz` | Chinese phonetics (one span per word, so words never break) |
| `zh` | Chinese translation (Traditional; Simplified is derived, see below) |
| `v` | verse number: consecutive lines with the same `v` (in the same part) form one verse |
| `before` / `after` | ritual instructions from the pecha: `[{ bo, en, zh }]`. They also end a verse |
| `goto` | `{ "section": "praises", "label": "→ 21 Praises ×3, then back" }`: a console button after this line that jumps away and sets the return bookmark |
| `kind` | `"vis"` or `"talk"`: prose to read (visualisation / explanation), set like a book page |
| `tara` | on the first line of a verse: show that figure (picture + name) with the verse |

Empty strings are simply not shown. A line with no phonetics in the reader's language shows its Tibetan instead.

### Fill-ins

Text in braces is said aloud by each person and appears small and faint: `{your name}`.
`{key:hint}` is filled from the figure chosen on the console, using the field of the same language. For example, `{name:Tārā}` becomes the chosen figure's `name.en` on an English line and its `name.bo` on a Tibetan line. If no figure is chosen, the hint is shown.

## Simplified Chinese

Phones convert the Traditional text character by character using `public/t2s.json`. Regenerate it after editing the Chinese:

```bash
cd tools && npm install && node make-t2s.mjs
```

## How lines become screens

A verse whose lines are all ≤ 12 Tibetan syllables is shown whole (up to 4 lines, longer verses split evenly). If any line is longer, lines go two at a time, and an odd line out joins the last pair. The console, phones and OBS share this code (`public/prayers.js`), so they always agree on what "the current screen" is.
