# Cadence

> **Web version:** a Home Screen PWA lives in [`web/`](web/) and needs no Mac or developer account. See [docs/WEB_INSTALL.md](docs/WEB_INSTALL.md).

A dark, offline-first music player for iPhone. Import audio from the Files app, and it plays
from inside the app: library, queue, lock-screen controls, and background audio. No accounts,
no analytics, no network access.

> **Build status: not compiled yet.**
> This code was written without access to a Mac or the iOS toolchain. Nothing here has been
> built, run, or tested. The first real result will come from the GitHub Actions workflow
> (`.github/workflows/ios-build.yml`). Until that run is green, treat the code as unverified
> and expect a few compile errors to fix. See [docs/CLOUD_BUILD.md](docs/CLOUD_BUILD.md).

## Milestone 1 (this repo)

| Area | What's there |
|---|---|
| Project | XcodeGen `project.yml` (no `.xcodeproj` committed), Swift 6, iOS 17+, GRDB 7 via SwiftPM |
| Storage | SQLite (GRDB): `artist`, `album`, `track`, `playlist`, `playlistTrack`, `queueItem`, `appState` |
| Import | Files picker (multi-select files or a whole folder), copied into the app sandbox, SHA-256 de-duplication, ID3 / iTunes tag + artwork extraction |
| Playback | One `AVPlayer`; play, pause, seek, next, previous, repeat off/all/one, queue add/play-next/reorder/remove |
| System | Background audio, lock-screen and Control Center controls, artwork, interruptions, headphone unplug |
| Persistence | Library, queue, current track, position and repeat mode survive relaunch |
| Screens | Home, Library (Songs / Albums / Artists / Playlists), Search, Now Playing, Queue, mini player |
| Tests | `PlayQueue` index logic and repository behaviour (in-memory SQLite) |

Supported formats: mp3, m4a/aac, wav, aiff, caf, flac. (ogg/opus are not playable by AVFoundation.)

## Not in this milestone

Gapless playback, crossfade, EQ/ReplayGain, downloads, cloud sources (Subsonic/Jellyfin, MusicKit,
Internet Archive), lyrics, CarPlay, widgets, iCloud sync. The engine's public surface
(`play`, `next`, `seek`, …) is what those will build on.

## Layout

```
project.yml                 XcodeGen spec (source of truth for the Xcode project)
Cadence/
  App/        CadenceApp, AppModel (composition root + UI-facing mutations)
  Core/       AppPaths, image decoding/caching
  Data/       migrations, models, LibraryRepository (all SQL), LibraryStore (observed lists)
  Import/     LibraryImporter (copy + hash + insert), MetadataReader (tags/artwork)
  Playback/   PlayQueue (pure logic), PlaybackEngine (AVPlayer), NowPlayingCenter
  UI/         Theme, components, Home, Library, Search, NowPlaying, MiniPlayer
CadenceTests/
.github/workflows/
  ios-build.yml             build + test on a macOS runner, uploads an unsigned .ipa
  testflight.yml            manual TestFlight upload (experimental, needs paid Apple account)
```

## Design notes

- **Files are copied, not referenced.** Playback never depends on security-scoped access or on
  the original still existing. The database stores file *names*, never absolute paths, so the
  library survives container path changes.
- **The UI observes the database.** `LibraryStore` runs GRDB `ValueObservation`s; any write shows
  up everywhere without manual refresh.
- **Queue logic is a pure struct** (`PlayQueue`) so the index bookkeeping around remove/move is unit tested.
- **Callbacks from system frameworks are explicitly `@Sendable`** (remote commands, notifications,
  time observer, artwork handler), to avoid Swift 6 main-actor isolation traps when they fire on other queues.

## Getting started

Read [docs/CLOUD_BUILD.md](docs/CLOUD_BUILD.md). It covers building from an iPhone only, reading
build results, and the realistic options for installing the app on your phone.
