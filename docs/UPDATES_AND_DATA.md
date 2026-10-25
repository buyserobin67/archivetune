# Updates and your music

Goal: install Cadence **once**, import your music **once**, and receive every future code update without importing again.

## What an update is allowed to touch

| Part | On update |
|---|---|
| App files (HTML, JS, CSS, icons) and the service-worker cache `cadence-shell-<version>` | Replaced |
| IndexedDB database `cadence` (songs, audio Blobs, artwork, playlists, lyrics, favorites, queue, history, settings) | **Kept.** Only upgraded in place by additive schema migrations |
| Backups (`.cadence` files in Files) | Untouched |

The app never calls `indexedDB.deleteDatabase()`, never clears site storage, never clears library tables and never unregisters the service worker. `web/src/lib/dataSafety.test.ts` fails the build if any of that appears in app code.

## How an update reaches your phone

1. You (or the release process below) publish a new build to the **same URL**.
2. The installed app notices the new service worker (when opened, when it returns to the foreground, every 30 minutes, or via Settings → About & data → Check for updates) and downloads it in the background. The running app keeps working on the old files.
3. A banner appears: **"New Cadence version available — Restart to update."**
4. Tap **Restart**. Playback pauses, the new worker takes over, the page reloads, and the database is opened (and upgraded if the schema changed). Tap **Later** to keep listening first.

Nothing restarts by itself, so an update never interrupts a song.

**One-time hop:** builds older than 0.4.0 activated updates automatically but the first update *to* 0.4.0 waits like any other. If you do not see the banner there (the old build has no banner), fully close Cadence (app switcher, swipe it away) and open it again; the new version takes over on that relaunch. From 0.4.0 on, the banner is the normal path.

## Settings → About & data

Shows the app version and build, the database version (this build expects v4), whether you are in Safari or the Home Screen app, the address you are on, an update history for this device, and a **Check for updates** button.

## Database changes (for developers)

Rules are in the comment at the top of `web/src/lib/db.ts`. In short: never edit an existing `version(n)` block; add `version(n+1)` with only the new/re-indexed stores (plus `.upgrade()` if rows must be reshaped); bump `SCHEMA_VERSION`; add a seeded case to `web/src/lib/migrations.test.ts`. Dexie runs an upgrade in one transaction, so a failed upgrade leaves the old database as it was. If the library cannot be opened the app shows a recovery screen (retry, back up what is readable) and never resets anything.

Optional new fields on existing rows do not need a migration; readers must tolerate their absence.

## Tests that protect your library

- `migrations.test.ts`: databases created exactly like releases v1, v2 and v3 (with songs, audio, artwork, playlists, queue, history, lyrics) are opened by the current code; every row and Blob is compared afterwards. Also: upgrading a *copy* leaves the original untouched, newer databases are never downgraded, old backups still restore.
- `dataSafety.test.ts`: no destructive storage calls anywhere; service worker only removes old `cadence-shell-*` caches; frozen schema versions unchanged.
- `sw.test.ts`, `update.test.ts`: new worker waits until Restart; never reloads on its own; first install is not announced as an update.
- `npm run e2e:upgrade` (also in CI): builds older releases from git, imports 10 songs in a **real browser profile**, deploys this build to the **same origin**, checks every record and Blob byte for byte, plays a song **offline**, then deploys a further version, checks the banner, taps Restart, checks the library again and plays offline again.

What these do **not** prove: behaviour in Safari or the iOS Home Screen app. They run in Chromium (CI adds WebKit for artwork only). Real-iPhone behaviour must be checked by you.

## Backup and restore

Settings → Backup & restore: **Export with music** (everything), **Export library only**, **Restore backup**. Backups record the app and database version that made them, restore into any newer version, and old backups without those fields still restore. Restoring skips songs you already have.

## Why a different address means a different library

Browsers keep IndexedDB **per origin** (scheme + host + port):

- `https://<project>.pages.dev` (production) and `https://<branch>.<project>.pages.dev` or `https://<hash>.<project>.pages.dev` (preview deployments) are **different origins** with **separate libraries**.
- Safari and an installed Home Screen app have **separate storage** even for the same address. A song imported in Safari is not in the Home Screen app.
- Deleting the Home Screen icon, "Clear History and Website Data", or iOS evicting unused site data under storage pressure removes that origin's library. Cadence asks for persistent storage, but iOS decides. **Keep backups.**

So: use one address, install it to the Home Screen once, import inside the Home Screen app, and always update that same address. Settings → About & data warns when you are on a preview address.

## Release process (permanent URL)

The production URL stays fixed because Cloudflare serves production from one **production branch** of the project. Previews never change it.

1. Build features on a branch such as `claude/cadence-web-persistence`. Cloudflare publishes a *preview* URL for it; use it only for looking, expecting an empty library there.
2. When you approve a version, **you** decide to promote it by merging/fast-forwarding it into the production branch (or changing the production branch setting once). Nothing in this repository changes that setting or deploys on its own.
3. Existing installs on the production URL see the "Restart to update" banner.
4. If a release is bad, roll back in Cloudflare (Deployments → previous deployment → Rollback) or revert the commit. Rolling back never touches data. Database versions only go up, so a build older than the data cannot downgrade it; it opens the newer database as it is.

Current state: the Cloudflare production branch is whatever you configured. This work does not change it.

## Listening recap data (database v4)

Version 4 added one table, `plays`, that logs a qualifying listen (30 seconds, or half of a song shorter than a minute) with the song's title, artist and album copied in, so recaps survive renaming or deleting a song. It is created empty on upgrade; every existing table and row is untouched. It stays on the device, is included in backups, and Settings → Listening recap → Clear listening history empties only this table.
