# How live.dzongsarinstitute.org works

These are the reverse-engineering notes behind this repository: what the original site does, how that was found out, and how this rebuild matches it.
The site was examined on 14 Oct 2026, using its public pages and the live event stream it sends to every visitor.

> **Clean-room note.** The original page says: *"© Dzongsar Institute. The prayer text, translations and this page are shared for this puja … please don't copy or republish them."*
> This repository therefore **contains none of their code, prayer text, translations, paintings or logo.**
> The architecture, protocol, data model and behaviour described below are facts about how the system works, and they were reimplemented from scratch.
> The demo text uses only canonical Tibetan verses, with new phonetics and translations.

## Method

| Step | Tool | Result |
|---|---|---|
| Fetch the page, headers and assets | `curl` | One self-contained HTML page (~124 KB, inline CSS and JS), plus `prayers.js`, `prayers.json`, `manifest.json` and images. Served from **Cloudflare** in front of a Node server on a Mac (`cf-ray`; a source comment says "Served on the public port :8091 … the tunnel points there"). |
| Static JS analysis | **REA** `analyze-javascript-application` (evidence `ev_9914d900…`) | 2 files, 12,296 AST nodes, 0 parse failures, 28 findings: localStorage (`dz.*`) and sessionStorage keys, plus the Wake Lock API. REA's static analyzer did not report the two real network calls (`EventSource("events?…")` and `fetch("prayers.json")`); they were found by reading the code. |
| Live protocol | `curl -N /events` | A Server-Sent Events stream. The message format is documented below. |
| Probing | `curl` | `/console`, `/operator` and `/sw.js` return 404: the operator console is **not** on the public port, and there is no service worker. |
| Runtime comparison | **REA** `list-browser-targets` + `inspect-web-page` over CDP (headless Chrome) | Original: 474 DOM nodes, 2 scripts, 7 `dz.*` localStorage keys, no workers, no WebSockets. This rebuild: 467 DOM nodes, 3 scripts (the inline script was split into a file), 6 `pl.*` keys, no workers, no WebSockets. |

## Architecture

```
 operator laptop (Mac)                                         congregation phones
 ┌────────────────────────────┐                                ┌──────────────────────┐
 │ console (private port)     │ POST state                     │ viewer page (PWA)    │
 │   click verse / → / Break  ├──────────┐                     │  Live card / Full    │
 │ OBS overlay (stream)       │          ▼                     │  text / Contents /   │
 └────────────────────────────┘   ┌──────────────┐   SSE       │  Settings            │
                                  │  server.js   ├────────────►│  EventSource(events) │
       data/prayers.json ────────►│  :8091 public│  cloudflared│  localStorage only   │
                                  └──────────────┘◄────────────┤  GET prayers.json    │
                                                    tunnel      └──────────────────────┘
```

* **No database and no accounts.** All the shared state is a single pointer into `prayers.json`, plus a few switches.
* **One-way push.** Phones never send anything except their query string on connect: a random device id, language, place and whether the page is installed. The server uses this only to count phones.
* **Personal data stays on the phone.** Settings and recitation counts live in localStorage.
* **No third-party requests.** No Google Fonts or analytics, so the page works where those are blocked. YouTube is a plain link.

## The live event stream (`GET /events?h=1&id=<uuid>&lang=<bo|en|zh|zhs>&where=<hall|online>[&app=1]`)

The server first sends `retry: <randomised ms>`. Each later message is `data: <JSON>`, and the first one also includes `hist`:

```json
{ "index": 319,            // line number in the flattened prayers.json (the live position)
  "set": true,             // false = not started → phones show the waiting screen
  "mode": "verse",         // "verse" | "line" (line mode dims the other lines of the verse)
  "round": 1,              // round of a repeated section (21 Praises) or of a prayer said ×N
  "bookmark": 393,         // where the operator returns after Break / a "goto" detour
  "delay": 0,              // the organisers' suggested delay (s) for online viewers
  "msg": "",               // a notice shown on every phone until closed
  "back": 0,               // epoch ms when the puja resumes (Break countdown)
  "open": ["jenang"],      // "reveal" sections currently opened (only phones set to "In the hall" show them)
  "tara": "20",            // chosen figure; fills {name:…} / {mantra:…} placeholders
  "reload": 1791796343009, // bumping this makes every phone reload once, spread over 20 s
  "yt": { "en": "<videoId>", "bo": "…", "zh": "…", "ch": "<channelId>" },
  "hidden": false, "test": false,
  "t": 1791967598913,      // server time of this change
  "now": 1791967609211,    // server time now → the phone computes its clock skew
  "pv": "46ca268ebc",      // prayers.json version hash → phones fetch the new text within 60 s
  "hist": [[t, {…state}], …] // the last ~150 s of changes (first message only)
}
```

A heartbeat `event: hb` is sent every 25 s. A phone treats a line that has been silent for 70 s (35 s after returning from the background) as dead and reconnects with exponential backoff and jitter.

**Online delay:** every message is stored with its time, corrected for clock skew. A tick every 250 ms then shows the newest message older than `now − delay`. Because `hist` arrives on connect, a phone that has just opened at a 30 s delay can still show the right verse immediately.

## The text model (`prayers.json`)

See [DATA-FORMAT.md](DATA-FORMAT.md). In brief: sections contain lines with `bo / tr / en / trz / zh` fields, a verse number `v`, `before`/`after` ritual notes, and an optional `goto`. Sections can be `anytime`, `card` (Break), `loop` (repeated rounds), `reveal` (hall only), or have `parts` and a `group` label. The loader flattens the lines and groups them into **screens**: up to 4 short lines, or 2 at a time when any line is over 12 Tibetan syllables, split evenly. The console, the phones and OBS all compute identical screens.

## Behaviour checklist (original → this rebuild)

- [x] Start flow: choose a language (བོད་ཡིག / English / 繁體 / 简体), then the place (hall/online), then a first-time guide
- [x] Top bar: logo + event/step title, YouTube link (online only), LIVE dot, progress bar
- [x] **Live** view: the current verse large, auto-fitted, with the section's figure picture (round portrait when space is short) and tap-to-zoom
- [x] **Full text** view: the whole puja, with the live verse highlighted and centred at 28% of the screen height; past verses dimmed; line mode
- [x] Leaving follow mode by scrolling shows a "Follow live" pill with "n behind / n ahead"; scrolling back to the live verse re-follows
- [x] Contents sheet: numbered steps, ✓ done, "Now" badge, group labels, jumps
- [x] Settings sheet: language, place, delay slider ±, organisers' timing, size (6 steps), theme (Evening/Parchment/Dim), Tibetan script / translation / instructions switches, my recitations
- [x] Break / waiting screen: the next step, a resume clock in local time, step dots, mantra, today's count, "Read the prayers"
- [x] Organisers' notice, toast messages, connection status
- [x] Hall-only `reveal` sections, the figure chosen on the console filling `{key:hint}`, a thank-you card when the section closes
- [x] Simplified Chinese converted on the phone from a per-text table
- [x] Recitation counter for `loop` sections (≥ 3 screens followed and the last one reached), stored on the phone only
- [x] PWA: manifest, install prompt on Android, step-by-step iOS/Android/in-app-browser instructions with a bouncing arrow, settings carried into the installed app via `?k=`
- [x] Screen Wake Lock, reduced-motion support, drag-down sheets
- [x] Server: versioned asset links (`?v=hash`), `prayers.json` hot reload, "refresh all phones", phone counts
- [x] Operator console and OBS overlay. These were not public, so they were rebuilt from the protocol: their fields and behaviour are implied by the messages and by comments in the client.

## Known differences

* The console and OBS overlay are **inferred** rather than observed, because they are not exposed publicly. They implement every field the protocol carries.
* `test` is interpreted as "rehearsal: phones keep waiting". The original always sent `false`, so its exact meaning is unknown.
* The Tara-specific "verses 3–23 = Tārā 1–21" rule is generalised: any verse whose first line has `"tara": "<id>"` shows that figure.
