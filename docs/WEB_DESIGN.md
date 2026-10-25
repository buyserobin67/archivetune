# Cadence Web: design system

## Tokens (`web/src/design/tokens.css`)

Everything visual reads from CSS variables; Tailwind maps to them in `web/tailwind.config.js`.

| Group | Variables |
|---|---|
| Surfaces | `--bg #050507`, `--surface-1/2/3`, `--line` |
| Text | `--fg`, `--fg-2` (64%), `--fg-3` (40%) |
| Accent (dynamic) | `--accent-rgb`, `--accent2-rgb`, `--accent-text-rgb`, `--tint-rgb` |
| Type scale (rem) | caption, footnote, body, body-lg, title, title-lg, display |
| Radii / shadows / motion | `--r-*`, `--shadow-float/card/art`, `--ease-out`, `--dur-*` |
| Layout | `--gutter` (safe-area aware), `--sat`, `--sab`, `--dock-h` (measured at runtime) |

Type is rem-based and `html` uses `font: -apple-system-body`, so iOS Dynamic Type scales the whole UI. Layouts are tested at 1.6x text.

## Dynamic accent

`lib/palette.ts` samples a 24x24 copy of the cover, builds a saturation-weighted hue histogram, and returns `accent` (fills), `accentText` (light, for text on black), `accent2` and a dark `tint`. Covers with no colour, and tracks with no cover, get a deterministic palette seeded from the album name. `lib/accent.ts` writes it to the CSS variables whenever the track changes, so the tab bar, buttons and player re-tint with the music.

## Player transitions

- Open/close uses the View Transitions API: the cover has `view-transition-name: cadence-art` (mini player when closed, full player when open), so it morphs between the two; the sheet slides.
- Swipe down on the header or cover to dismiss; the sheet follows the finger and flings away on velocity.
- Browsers without View Transitions, and `prefers-reduced-motion`, use a plain CSS slide / no motion.

## Performance rules

- No `backdrop-filter` on anything that scrolls (tab bar and mini player are opaque). Blur only on the static player backdrop and modal sheets.
- Animations are transform/opacity only. Long lists use `content-visibility: auto`.
- The audio element, queue and IndexedDB layers are unchanged from the MVP.

## Tests

`npm run e2e` (Playwright + Chromium) drives the production build at 320x568, 375x667, 390x844, 430x932 and 1.6x text, with emulated safe-area insets. It checks horizontal overflow, header/control overlap, dock position, import and dedup, playback, accent changes, swipe dismiss, offline reload and reduced motion, and writes screenshots to `web/e2e/screenshots/` (CI uploads them as an artifact). It runs in desktop Chromium, **not** in Safari or on an iPhone.
