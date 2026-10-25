# Cadence Web

Offline-first music player as a PWA. React + TypeScript + Vite, Tailwind, Dexie (IndexedDB), one persistent `HTMLAudioElement`, Media Session API, hand-written service worker. Music never leaves the device.

```
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest (fake-indexeddb)
npm run build      # typecheck + production build into dist/
npm run e2e        # browser E2E at iPhone viewports (needs a build with VITE_BASE=/archivetune/; see docs/WEB_DESIGN.md)
```

Production builds for GitHub Pages need the repo subpath: `VITE_BASE=/<repo>/ npm run build && node scripts/verify-dist.mjs /<repo>/`.
Cloudflare Pages (free, works with a private repo) builds from `web/` with the default base `/`: see [../docs/CLOUDFLARE_PAGES.md](../docs/CLOUDFLARE_PAGES.md).
CI does this automatically (`.github/workflows/web-pages.yml`). See [../docs/WEB_INSTALL.md](../docs/WEB_INSTALL.md) for iPhone install steps and limitations.

## Layout

| Path | What |
|---|---|
| `src/lib/db.ts` | Dexie schema: `tracks`, `blobs` (audio), `art`, `playlists`, `settings` |
| `src/lib/library.ts` | import (hash, tags, atomic transaction), dedup, search, grouping |
| `src/lib/queue.ts` | pure queue model (shuffle, repeat, move, remove) |
| `src/lib/player.ts` | the single audio element + Media Session + restore |
| `src/lib/backup.ts` | `.cadence` export/restore (lazy `Blob.slice`, no giant buffers) |
| `src/lib/lrc.ts`, `lyrics.ts` | LRC parser, sidecar matching, embedded lyrics (never fetched online) |
| `src/lib/moods.ts` | rule-based mood chips + Quick Picks from real library data |
| `src/lib/storage.ts` | quota estimate, persistence request, warnings |
| `src/sources/` | `MusicSource` interface, direct-URL and catalog sources, license gate |
| `public/sw.js` | service worker; `vite.config.ts` injects the file list + version at build |

## Design notes

- **Hash routing** (`/#/library/songs`): refresh and deep links work on GitHub Pages with no server rewrites. `404.html` is also emitted as a fallback.
- **Service worker** precaches the build output under `/<repo>/` with `scope: /<repo>/`, serves the shell for every in-scope navigation, never touches cross-origin requests, and drops old caches when a new build activates.
- **Import is atomic**: track row, audio blob and artwork are written in one IndexedDB transaction. A quota error aborts it, leaves the library unchanged, and surfaces a friendly message.
- **Licensed downloads**: a track is only fetched if its source states `allowsDownload: true` and provides a license name and credited artist; streaming-service hosts are refused. Attribution is stored with the track and shown in the player.
