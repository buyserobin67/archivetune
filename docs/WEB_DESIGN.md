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
- **Mini-player** sits directly above the tab bar. Swipe it left or right to skip, drag it up to open the player. The dock hides while the keyboard is open.
- **Toasts** never cover page content: they show inside the mini-player when there is one, above the tab bar when there isn't, and under the header while the player is open. A toast can carry an action (Undo).
- **Long-press** (or right-click) a song, card, album or artist for its menu: Play next, Add to queue, Go to album / artist, Add to playlist. `lib/longPress.ts` swallows the tap that ends the press.
- **Home**: wordmark and small circular actions; mood chips; Recap card (only after the first counted listen); Quick Picks (large cover cards); Keep listening (compact rows); Recently played albums; Favorites; Albums.
- **Albums** sort by disc, then track number, with Disc dividers when an album spans several discs.
- **Empty library**: one compact welcome card with the import button, plus clearly labelled, non-interactive **Example** placeholders. Nothing playable is invented.
- **Now Playing**: collapse button and track context; square cover; title, artist, favorite and overflow; thin progress; five controls (shuffle, previous, rounded-square play/pause, next, repeat); pills for Queue, Sleep timer and Lyrics. The cover springs back with a small overshoot on resume. The progress bar grows while held, shows the time over the handle, and scrubs at half, quarter or fine speed as the finger slides away from it. Remaining time rounds up.
- **Queue**: drag the handle to reorder (arrow keys on the handle do the same), swipe left or tap the bin to remove, with Undo. When the queue is about to stop, **Keep playing similar** queues the rest of the album, then the artist, genre and mood (`lib/similar.ts`), only from real matches.
- **Lyrics**: current line prominent, neighbours dimmed, smooth auto-scroll, tap a line to seek, soft blurred cover behind. The sung line fills word by word with a soft edge: from `<mm:ss.xx>` word stamps in enhanced LRC, otherwise spread over the line by letters. The lyrics menu nudges timing ±0.5 s per song (stored as `offset` on the lyrics row). Time-synced from `.lrc` sidecars or embedded SYLT/USLT tags; plain text fallback; empty state with add/paste. Lyrics are never fetched from a server.

## Data-driven sections (no fake recommendations)

`web/src/lib/moods.ts` documents the rules. A mood chip appears only when at least 3 real tracks match it:

| Mood | Rule |
|---|---|
| Energize / Relax / Workout | ID3 genre tag matches the rule's genre list |
| Commute | 2 to 6 minute songs you have played or favorited |

Quick Picks blends favorites, most played and newest. Tracks imported before genre support are scanned once in the background (`lib/backfill.ts`).

## Playback

- **Next song prefetch**: 10 s before the end the next song's row and audio are read into memory, so the switch skips the database read. Still one `<audio>` element: a second element could get closer to gapless, but iOS ties the background audio session and lock-screen controls to the element that is playing.
- **Volume levelling** (Settings → Playback): applies ReplayGain tags (track or album) through `audio.volume`, which can only turn louder songs down. **iOS ignores `volume` on media elements**, so on iPhone the setting is disabled and says why; it works in desktop and Android browsers. Gains are read at import and, for older rows, once by `lib/backfill.ts` (`tagsV`).
- **Long background pause**: after more than 30 s paused with a trip to the background, the first play reloads the song at the same spot instead of trusting an audio session iOS may have dropped.
- **Haptics** (Settings → Playback): play/pause, favourite, closing the player, sleep timer, skip gestures, long-press. `navigator.vibrate` where it exists; on iOS the `<input type="checkbox" switch>` toggle trick (Safari 17.4+). Apple may close it; failures are silent.

## Recap image

Share on the Recap screen draws a 1080x1350 PNG on the device (`lib/recapCard.ts`): the top artist's cover, listening time, counts and top songs. It is prepared as soon as the numbers settle, because iOS only opens the share sheet straight from a tap. Without file sharing it downloads instead.

## Artwork colour

`lib/palette.ts` samples a 24x24 copy of the cover into a saturation-weighted hue histogram. The result only tints the Now Playing background, the mini-player and a few highlights. Greyscale covers and tracks without art fall back to a deterministic, low-saturation palette seeded from the album.

## Motion and performance

- Open/close uses View Transitions (cover morph, sheet slide). Other browsers and `prefers-reduced-motion` get a plain slide or none. Swipe down on the header or cover to dismiss.
- No `backdrop-filter` on anything that scrolls. Animations are transform/opacity only. Long lists use `content-visibility: auto`.

## Tests

`npm run e2e` (Playwright + Chromium) drives the production build at 320x568, 375x667, 390x844, 430x932, an installed-app viewport (402x874 with `navigator.standalone`) and 1.6x text, with emulated Dynamic Island and home-indicator insets. It checks overflow, overlap, compact empty state, tab bar, Home moods, import with `.lrc` sidecar and duplicate, playback, sleep timer, lyrics, queue, swipe dismiss, keyboard-height viewport, offline and reduced motion, and saves screenshots to `web/e2e/screenshots/` (CI uploads them). `npm run e2e:polish` covers toasts, long-press menus, mini-player swipes, scrubbing, queue drag / swipe / undo, Keep playing similar, karaoke and lyric timing, the recap image, disc dividers and the levelling setting. It runs in desktop Chromium, **not** in Safari or on an iPhone.
