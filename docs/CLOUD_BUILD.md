# Building Cadence without a Mac

Everything below can be done from an iPhone (Safari + the GitHub app). GitHub's macOS runners do the compiling.

## 1. Run the build

The repo is `buyserobin67/archivetune`, branch `claude/cadence-ios-mvp`.

1. Open the repo on github.com, then the **Actions** tab.
2. The workflow **iOS build & test** runs automatically on every push to any branch.
   To re-run it: open the run, then **Re-run all jobs**.
3. A green run means it compiled, the unit tests passed, and an unsigned `.ipa` was produced.
   That is the first point at which you can say the code builds.

`workflow_dispatch` ("Run workflow" button) only appears once the workflow file is on the
repo's default branch. To get it, merge the branch into your default branch via a pull request.

### If the run is red

Expect this on the first run. The code has never been through a compiler. Open the failed step, find the
lines that contain `error:`, and send them to me. They point at an exact file and line. Typical first-run
issues are Swift 6 concurrency diagnostics and small SDK API mismatches. The **test-logs**
artifact contains the full `xcodebuild` log and the `.xcresult` bundle.

## 2. Running the app on your iPhone

The build produces an **unsigned** `.ipa` (artifact `Cadence-unsigned-ipa`). iOS refuses to run unsigned
apps, so it must be signed by someone first. The realistic options:

| Route | Cost | Needs a computer? | Notes |
|---|---|---|---|
| **TestFlight** via `testflight.yml` | Apple Developer Program, US$99/year | No | The clean route, and the one this repo is set up for. Untested, see below. |
| Re-sign the unsigned `.ipa` with a free Apple ID (AltStore, Sideloadly, etc.) | Free | Usually yes (the signing tool runs on a PC/Mac) | 7-day certificate expiry on free accounts. |
| Third-party signing services | Varies | No | Not covered or endorsed here. You hand your app and Apple credentials to a stranger. |

I can't verify which of these will work for your account. TestFlight is the only one with automation in this repo.

### TestFlight setup (all doable from a phone browser)

1. Enroll in the Apple Developer Program (developer.apple.com).
2. Pick a unique bundle id, e.g. `com.yourname.cadence`. Change `PRODUCT_BUNDLE_IDENTIFIER` in
   `project.yml` (both targets, the tests one gets `.tests` appended).
3. In App Store Connect → **Apps → +**, create the app record with that bundle id.
4. In App Store Connect → **Users and Access → Integrations → App Store Connect API**, create a key
   with the **App Manager** role. Note the **Key ID** and **Issuer ID** and download the `.p8` (one-time download).
5. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - Secrets: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (paste the whole `.p8` text)
   - Variable: `BUNDLE_ID` (the bundle id from step 2)
6. Merge to the default branch, then **Actions → TestFlight upload (manual) → Run workflow**.
7. After App Store Connect finishes processing, install through the **TestFlight** app.

`testflight.yml` has never run. Signing steps in particular often need a round of fixes.
Send me the log if it fails.

## 3. Using the app

1. Put audio files in the **Files** app (On My iPhone or iCloud Drive).
2. In Cadence, tap the **+** button → **Import Files** or **Import Folder**.
3. Files are copied into the app and de-duplicated by content. After import they play offline,
   and the originals can be removed.

## 4. Local development later

If you ever get a Mac: `brew install xcodegen && xcodegen generate && open Cadence.xcodeproj`.
The `.xcodeproj` is generated and git-ignored; edit `project.yml`, not the project file.
