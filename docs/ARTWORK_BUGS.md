# Artwork bars on iPhone: root cause and fix

Reported: every cover (Home, Library, Search, album page, mini-player, Now Playing) showed large grey bands above and below, with the real picture in a 16:9 strip across the middle.

## What the screenshots prove

Measured from your seven full-resolution screenshots (1206x2622):

| Evidence | Result |
|---|---|
| Colour of the bands, sampled at 40+ points on Now Playing | exactly **rgb(36, 38, 41) = `#242629`**, our card colour (`--surface-2`) |
| Height of the picture strip | 620 px inside a 1103 px wide square, so **16:9 exactly** (0.562) |
| iOS's own artwork in the **Dynamic Island** (drawn by iOS from the raw image bytes, none of our CSS) | the same 16:9 strip with **white** bands above and below |

If the bands were our CSS, the Dynamic Island (which has no Cadence CSS) would show a plain cover. If the bands were opaque pixels in the file they would be the same colour everywhere. Instead the *same* pixels are `#242629` in the app (our card colour shows through) and white in iOS (iOS paints white behind). That is what **transparent pixels** do. So the embedded picture is a square image with a 16:9 frame in the middle and **fully transparent rows above and below**.

What was ruled out:
- `object-fit` / aspect ratio: with real non-square covers (16:9 pillarboxed, landscape, portrait) the app fills the square correctly in Chromium, and `e2e/webkit-art.mjs` runs the same check in WebKit in CI. A "Render check" in the diagnostics screen measures the box and `object-fit` of your real images.
- Blob creation, MIME type, metadata extraction: bytes are stored exactly as embedded.
- Resizing: Cadence never resizes artwork for display.

Reproduction: `e2e/fixtures/art-transparent.mp3` has exactly this image. The "before" screenshots in `docs/screenshots/iphone-fixes/` are the previous build showing your bars on that fixture.

**Caveat:** I could not open your actual file. The cause is established from the measurements above and reproduced with a synthetic file. To confirm it on your real file: Settings → Artwork → **Scan artwork**. It should say `alpha, NN% transparent` and `Transparent border: NNNpx top, NNNpx bottom`. Tap **Copy report** and send it if it says anything else.

## Why CSS could not fix it

The bars are pixels of the image. Cropping with CSS would hide them only by also cutting the picture, and would be wrong for every other cover. The border has to be detected and the picture trimmed.

## The fix

- **Border detection** (`lib/artwork.ts`, pure and unit-tested): finds fully transparent rows/columns on all four sides. Flat-colour borders are detected too but only trimmed on request, since a flat frame can be a design choice.
- **Non-destructive**: the trimmed picture is stored as a separate copy (`artEdits` table, database v3). The embedded original is never modified. **Use original** and **Undo all** restore it exactly. Deleting a song removes its copy.
- **Automatic for transparent borders**: new imports and (once, in the background) existing songs. Switch off in Settings → Artwork. After trimming, a 16:9 picture is shown cover-fitted, which centres on the real square cover.
- **Everywhere**: one shared cover component, so Home, Library, Search, album pages, mini-player, Now Playing, the Dynamic Island / lock-screen artwork and the player background colours all use the trimmed copy.
- **Diagnostics** (Settings → Artwork): size, type, bytes, alpha share, border thickness and verdict per cover, a render check, **Trim / Use original** per song, **Trim all**, **Undo all**, **Copy report**.
- A defensive change: the `<img>` is now absolutely positioned in its square, so its box can never depend on a percentage of an aspect-ratio parent. Landscape, pillarboxed and portrait covers were already fine; this removes a class of engine differences.

## Other fixes in this change

- **Queue**: "Up next" no longer lists the song that is playing. The current song is its own *Now playing* section; *Up next* holds only what follows; earlier songs sit under *Show previously played*. Repeat-one and repeat-all are explained instead of repeating the song as a fake queue entry. Unit-tested for single song, multiple songs, repeat one/all and shuffle.
- **Now Playing**: the cover and title are one group centred in the free space; cover capped at 20rem and 42% of the height; controls and the Queue / Sleep / Lyrics pills stay together at the bottom.
- **Library**: one compact text-tab row; sort and the favorites filter moved into a menu (button beside the search field); small Play / Shuffle.
- **Mini-player**: about 8px shorter, 36px cover, full-size touch targets.

## One thing I could not explain from the screenshots

Every screen ends about 90pt above the bottom of the display: the layout box is about 812pt tall on an 874pt screen, so there is empty space under the tab bar and under the player controls. I cannot tell whether iOS gives the Home Screen app a shorter viewport or whether something in the layout causes it. Settings → **Display** now shows the real numbers (viewport, screen, safe areas, the app's own box) with **Copy display info**, and an opt-in **Fill full screen height** switch to test the stretch. Please try it and send the numbers; I have not verified it on a device.
