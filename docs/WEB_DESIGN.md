# Cadence Web: design system

Compact, artwork-first, flat charcoal. Inspired by the calm density of modern music apps; the logo, icons and layout details are Cadence's own.

## Tokens (`web/src/design/tokens.css`)

Everything visual reads from CSS variables; Tailwind maps to them in `web/tailwind.config.js`.

| Group | Values |
|---|---|
| Surfaces | `--bg #101214`, `--surface-1 #181a1c` (tab bar), `--surface-2 #242629`, `--surface-3 #303236` |
| Text | `--fg #f5f5f5`, `--fg-2 #a5a5a8`, `--fg-3 #77777b` |
| Primary accent | white (`--accent-rgb`). Primary buttons are white with black text |
| Artwork colours (subtle only) | `--art-rgb`, `--art2-rgb`, `--art-text-rgb`, `--tint-rgb`, set at runtime from the cover |
| Spacing | 8px grid (`--space-*`), `--gutter` is safe-area aware |
| Type (rem) | caption 11, footnote 13, body 15, body-lg 16, title 20, title-lg 26, display 32 |
| Radii / shadows / motion | `--r-*`, `--shadow-float/card/art`, `--ease-out`, `--dur-*` |
| Layout | `--sat`, `--sab`, `--dock-h` (measured at runtime so scroll areas pad exactly) |

Type is rem-based and `html` uses `font: -apple-system-body`, so iOS Dynamic Type scales the UI. Controls that must stay on screen (transport buttons) use `min(rem, vw)` sizes so they never overflow at large text.

## Layout

- **Three tabs**: Home, Search, Library, in a compact floating bar. **Settings** is the gear in the Home header.
- **Mini-player** sits directly above the tab bar. The dock hides while the keyboard is open.
- **Home**: wordmark and small circular actions; mood chips; Quick Picks (large cover cards); Keep listening (compact rows); Recently played albums; Favorites; Albums.
- **Empty library**: one compact welcome card with the import button, plus clearly labelled, non-interactive **Example** placeholders. Nothing playable is invented.
- **Now Playing**: collapse button and track context; square cover; title, artist, favorite and overflow; thin progress; five controls (shuffle, previous, rounded-square play/pause, next, repeat); pills for Queue, Sleep timer and Lyrics.
- **Lyrics**: current line prominent, neighbours dimmed, smooth auto-scroll, tap a line to seek, soft blurred cover behind. Time-synced from `.lrc` sidecars or embedded SYLT/USLT tags; plain text fallback; empty state with add/paste. Lyrics are never fetched from a server.

## Data-driven sections (no fake recommendations)

`web/src/lib/moods.ts` documents the rules. A mood chip appears only when at least 3 real tracks match it:

| Mood | Rule |
|---|---|
| Energize / Relax / Workout | ID3 genre tag matches the rule's genre list |
| Commute | 2 to 6 minute songs you have played or favorited |

Quick Picks blends favorites, most played and newest. Tracks imported before genre support are scanned once in the background (`lib/backfill.ts`).

## Artwork colour

`lib/palette.ts` samples a 24x24 copy of the cover into a saturation-weighted hue histogram. The result only tints the Now Playing background, the mini-player and a few highlights. Greyscale covers and tracks without art fall back to a deterministic, low-saturation palette seeded from the album.

## Motion and performance

- Open/close uses View Transitions (cover morph, sheet slide). Other browsers and `prefers-reduced-motion` get a plain slide or none. Swipe down on the header or cover to dismiss.
- No `backdrop-filter` on anything that scrolls. Animations are transform/opacity only. Long lists use `content-visibility: auto`.

## Tests

`npm run e2e` (Playwright + Chromium) drives the production build at 320x568, 375x667, 390x844, 430x932, an installed-app viewport (402x874 with `navigator.standalone`) and 1.6x text, with emulated Dynamic Island and home-indicator insets. It checks overflow, overlap, compact empty state, tab bar, Home moods, import with `.lrc` sidecar and duplicate, playback, sleep timer, lyrics, queue, swipe dismiss, keyboard-height viewport, offline and reduced motion, and saves screenshots to `web/e2e/screenshots/` (CI uploads them). It runs in desktop Chromium, **not** in Safari or on an iPhone.
