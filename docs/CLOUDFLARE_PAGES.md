# Deploy Cadence Web to Cloudflare Pages (free, private repo, iPhone only)

Cloudflare Pages builds the app from your **private** GitHub repo and publishes only the build output (`web/dist`) at `https://<name>.pages.dev`. No credit card, no paid GitHub plan, no secrets in the repo. GitHub Pages stays available as an alternative (`.github/workflows/web-pages.yml` is untouched).

## What is already configured in the repo

| File | Purpose |
|---|---|
| `web/public/_headers` | Cloudflare headers: service worker and manifest always revalidate, hashed assets cached for a year, `noindex`, no referrer |
| `web/.node-version` | Pins Node 22 for the Cloudflare build |
| `web/vite.config.ts` | Base path defaults to `/` (Cloudflare serves from the domain root). Do **not** set `VITE_BASE` there |
| `web/scripts/verify-dist.mjs` | Fails the build if any audio/video file ends up in `dist` |

Routing uses `/#/…`, so refresh and deep links work with no redirect rules. The service worker registers at `/sw.js` with scope `/`.

## Steps (all in Safari on your iPhone)

1. **Create a Cloudflare account.** Open `https://dash.cloudflare.com/sign-up`, enter an email and password, then open the verification email and tap its link. Choose the **Free** plan if asked. No card needed.
2. **Start a Pages project.** In the dashboard tap **Workers & Pages** (menu) → **Create** (or **Create application**). Switch to the **Pages** tab and tap **Connect to Git**. If you only see Workers options, tap the small link **"Looking to deploy Pages? Get started"** near the bottom.
3. **Connect GitHub.** Tap **Connect GitHub**. Safari goes to github.com: sign in, then on the "Cloudflare Workers & Pages" authorization page choose **Only select repositories** and pick `buyserobin67/archivetune`, then **Install & Authorize**. Your repo stays private; Cloudflare gets read access to that one repo.
4. **Select the repo** `archivetune` and tap **Begin setup**.
5. **Project name:** use something hard to guess, e.g. `cadence-` plus a few random letters. The name becomes the URL (`<name>.pages.dev`), which is public to anyone who has the link.
6. **Production branch:** type `claude/cadence-web-redesign`.
7. **Build settings** (open the section if collapsed):
   - Framework preset: **None** (or Vite; the values below win)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory (advanced): `web`
8. **Environment variables:** none are required. If the build complains about Node, add `NODE_VERSION` = `22`. Do not add `VITE_BASE`.
9. Tap **Save and Deploy**. The first build takes 1 to 3 minutes. When it says **Success**, tap the `https://<name>.pages.dev` link.
10. **Install on the Home Screen:** in Safari tap **Share** → **Add to Home Screen** → **Add**. Open Cadence from the new icon.
11. **Import music inside the Home Screen app** (Files → pick songs). The Home Screen app has its own storage, separate from Safari tabs and from any `github.io` copy, so the library starts empty there.

## Updating

Every push to `claude/cadence-web-redesign` triggers a new build and deploy automatically. On the phone, fully close Cadence (app switcher, swipe up) and open it twice so the new service worker takes over.

## Privacy and what is deployed

- The repo remains private. Only `web/dist` is published: HTML, JS, CSS, icons, manifest, service worker.
- No music is ever in the repo's deploy output. Your songs live only in the app's IndexedDB on your phone. `verify-dist` fails the build if an audio or video file appears in `dist`. (The repo does contain tiny synthetic test tones in `web/e2e/fixtures`; they are not deployed.)
- The `pages.dev` URL itself is reachable by anyone who knows it (it contains only the app, no music). Cloudflare Zero Trust **Access** (free for up to 50 users) can put a login in front of it, but that is optional and has more setup steps.
- Branches other than the production branch get separate preview URLs. You can turn that off in the project's **Settings → Builds → Branch control**.

## Trying a new UI branch without touching production

Cloudflare builds every non-production branch as a **preview deployment** (on by default). To test `claude/cadence-web-compact-ui`:

1. Cloudflare dashboard → Workers & Pages → your project → **Deployments**.
2. Under **Preview**, open the newest deployment for that branch and tap **Visit**. The branch URL looks like `https://claude-cadence-web-compact-ui.<project>.pages.dev` (slashes become dashes).
3. Add it to the Home Screen the same way. A preview has its own origin, so its library starts empty: import a few songs, or use Settings → Export / Restore backup to move your library over.

Production stays on the branch you set during setup. Changing it is a deliberate step (Settings → Builds → Branch control) and is not done by the code in this repo.

## Switching or rolling back

- Test the original UI: project **Settings → Builds → Branch control → Production branch** → `claude/cadence-web-mvp`, then **Retry deployment** / push.
- Use GitHub Pages instead: enable Pages (paid for private repos) and run the "Cadence Web" workflow, see `docs/WEB_INSTALL.md`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails: `Could not read package.json` | Root directory must be `web` |
| Build fails on Node version | Add env var `NODE_VERSION` = `22` |
| Blank page, 404 for `/archivetune/assets/...` | `VITE_BASE` is set in Cloudflare; delete it and redeploy |
| Old UI after an update | Close the app fully and reopen twice; or delete and re-add the Home Screen icon (this keeps nothing: export a backup first) |
| `pages.dev` name already taken | Choose a different project name |

## What was tested

The build output was verified for base `/` (`verify-dist`), served with `vite preview` at the domain root, and exercised in headless Chromium: service-worker scope `/`, import, offline reload and offline playback. The Cloudflare build and the iPhone install have not been run by me; the steps above need your Cloudflare account.
