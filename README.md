# puja-live

**The prayer text follows the puja, live, on every phone in the hall and online.**

An operator clicks through the text on a laptop. Every phone that has the page open highlights the verse being chanted, with phonetics and translation, in Tibetan, English, Traditional or Simplified Chinese. People watching the video stream get the text held back to match it.

This is a clean-room rebuild of the system behind *live.dzongsarinstitute.org*. It has the same architecture, protocol and features, written from scratch, with a demo text. See [docs/REVERSE-ENGINEERING.md](docs/REVERSE-ENGINEERING.md) for how the original works and how this rebuild was checked against it.

- **Zero dependencies.** Node 18+ only. No database, no build step, and no outside services, so it also works where Google is blocked.
- **Phones:** an installable PWA with Live and Full text views, Contents, Settings (size, 3 themes, script, translation, notes), a break screen with a countdown, organisers' notices, an online delay slider, and a recitation counter.
- **Operator:** a console with keyboard control, Break/Resume, rounds, detours ("21 Praises ×3, then back"), hall-only sections, notices, phone counts, and "refresh all phones".
- **Stream:** a transparent OBS subtitle overlay.

## Run it

```bash
npm start
```

| | URL | who |
|---|---|---|
| Viewer (phones) | http://localhost:8091/ | public: point the tunnel here |
| Console | http://127.0.0.1:8090/ | the operator only (bound to localhost) |
| OBS overlay | http://127.0.0.1:8090/obs?lang=en&tib=1 | Browser Source, 1920×1080, transparent |

To try it, open the console and the viewer side by side. Choose a language and *In the hall* on the viewer, click **Next ▶** in the console (or press →), and watch the phone follow.

### Console keys

`→` `Space` next · `←` previous · `L` verse/line mode · `B` break. Double-click a section in the left column to start it.

## Put it online

Expose **only the public port**. A Cloudflare Tunnel works well and needs no open router ports:

```bash
cloudflared tunnel --url http://localhost:8091
```

For a fixed hostname, create a named tunnel and route your domain to `http://localhost:8091`. The SSE stream works through Cloudflare as is: the server sends `Cache-Control: no-transform` and a 25 s heartbeat.

| env var | default | |
|---|---|---|
| `PORT` | `8091` | public viewer port |
| `HOST` | `0.0.0.0` | public bind address |
| `CONSOLE_PORT` | `8090` | console port |
| `CONSOLE_HOST` | `127.0.0.1` | keep it local, or set `CONSOLE_PASSWORD` if you expose it on the LAN |
| `CONSOLE_PASSWORD` | – | HTTP Basic password for the console (any username) |
| `DATA_DIR` | `./data` | where `prayers.json` and `state.json` live |

One small Node process handles thousands of SSE connections. The live state is saved to `data/state.json`, so a restart resumes where it was, and phones reconnect by themselves with jittered backoff.

## Make it yours

1. **Text:** replace `data/prayers.json` ([format](docs/DATA-FORMAT.md)). Edits go live while running.
2. **Simplified Chinese:** run `cd tools && npm install && node make-t2s.mjs` after changing Chinese text.
3. **Artwork:** replace `public/images/{logo,cover,icon-192,icon-512}.png`, and set `"img"` on each entry of a section's `taras` list for the Live-card pictures. Running `npm run icons` regenerates the placeholders.
4. **Tibetan font:** drop `Jomolhari-Regular.ttf` (SIL OFL) into `public/fonts/` and it will be used automatically.
5. **Names:** set `event` / `practice` in `prayers.json` and `name` in `public/manifest.json`. The UI words are in `WORDS` at the top of `public/viewer.js`; Tibetan UI strings are welcome.
6. **After changing the page itself:** bump `PAGE_V` in `viewer.js` and set `"viewer"` in `prayers.json` to the same number. Open phones then reload once.

## Layout

```
server.js            HTTP + SSE server (public port and console port)
public/viewer.html   phone page (template: the server fills in content versions and the font)
public/viewer.css    design tokens, themes, layout
public/viewer.js     the phone app: live sync, views, settings, install help
public/prayers.js    shared loader: prayers.json → lines and screens (viewer, console, OBS)
public/console.html  operator console
public/obs.html      stream subtitle overlay
data/prayers.json    the text (demo)
tools/               make-icons.js, make-t2s.mjs
test/                node --test: screen grouping and the live protocol
docs/                reverse-engineering notes, data format
```

```bash
npm test
```

## Content and credits

The demo text uses canonical Tibetan verses (refuge, the four immeasurables, opening verses of the Praises to Tārā, the dedication), with phonetics and translations written for this demo. Replace them with your own. Do not copy the prayer text, translations or paintings from live.dzongsarinstitute.org: they are © Dzongsar Institute and shared only for their puja.

Code: MIT.
