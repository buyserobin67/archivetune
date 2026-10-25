# Cadence Web: install on iPhone (no computer needed)

Cadence Web is a Home Screen web app. It needs no Apple Developer account, no Mac and no App Store.

**URL (after the first successful deploy):** `https://buyserobin67.github.io/archivetune/`

## One-time setup (done in the GitHub app or github.com on your phone)

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo → **Settings → Environments → github-pages → Deployment branches**: allow `claude/cadence-web-mvp` (or merge the branch into your default branch). If this is not allowed, the deploy job fails with "Branch is not allowed to deploy".
3. Repo → **Actions → "Cadence Web" → Run workflow** (or just push). Wait for the green check. The URL appears on the run's `deploy` job.

> GitHub Pages on a **private** repo needs a paid GitHub plan, and the published site is public to anyone with the link even if the repo is private. The site contains only the app code. Your music is never in the repo and is never uploaded anywhere. If you don't want a public URL, don't enable Pages.

## Install

1. Open the URL in **Safari** (not Chrome or an in-app browser).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Cadence** from the Home Screen. Always use that icon: Home Screen apps get their own storage and the best background-audio behavior.
4. Open Settings in the app. If "Persistent storage" shows *not granted*, tap **Request persistent storage**. iOS may decline. That's expected.

## Add music

1. Save your songs in the **Files** app (iCloud Drive or On My iPhone).
2. In Cadence tap **Import music**, pick one or many files (MP3, M4A/AAC, WAV, AIFF, CAF, FLAC). Duplicates are skipped automatically.
3. Songs play offline from then on. Try it: turn on Airplane Mode and press play.

## Keep your music safe

- **Keep your originals in Files.** Safari can clear website storage. If that ever happens, re-import.
- Settings → **Export with music** writes a `.cadence` backup (save it to Files). **Restore backup** brings it back. **Export library only** is small and keeps playlists/favorites/metadata; audio then needs re-importing or a full backup.
- The Settings page shows how much space is used and warns when storage is low.

## Updating

The app updates itself the next time it opens online: close it fully (swipe up in the app switcher) and open it twice.

## If playback stops

- Phone calls, Siri and other apps can interrupt audio. Cadence shows "Paused · interrupted"; tap play (or the lock-screen play button).
- If it stops after a long time in the background, iOS suspended the web app. Open Cadence and tap play.
- First play after launch needs a tap; iOS blocks autoplay.

## Known iOS limitations

- Storage is not guaranteed to be permanent. `navigator.storage.persist()` is requested but iOS decides.
- Background/lock-screen playback is supported by Safari for web audio, but iOS may suspend web apps; it is not guaranteed.
- Lock-screen controls (play, pause, previous, next, seek) depend on the iOS version.
- No autoplay on launch. No volume control in-app (use the hardware buttons).
- OGG/Opus generally won't play in Safari.
- Very large files are read into memory while hashing for de-duplication; a multi-hundred-MB file may fail on older phones.
- Backups are a single file; a full backup of a big library can be several GB.

## What has and has not been tested

Automated: 80+ unit tests (import, dedup, playlists, queue, offline playback with the network blocked, service-worker caching, quota failures, backup/restore, license gating), plus a headless **Chromium** run emulating an iPhone screen (import → play → go offline → reload → play). 

**Not tested on a real iPhone or in Safari/WebKit**: lock-screen controls, screen-locked playback, Safari-in-background playback, Home Screen install, interruption behavior, persistent-storage grant. Please verify those on your device and report what you see.
