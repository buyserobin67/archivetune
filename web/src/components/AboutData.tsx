import { useEffect, useState } from 'react';
import { APP_BUILD, APP_BUILT_AT, APP_VERSION } from '../lib/appInfo';
import { db, getSetting, SCHEMA_VERSION, type AppRun } from '../lib/db';
import { classifyOrigin } from '../lib/origin';
import { isStandalone } from '../lib/pwa';
import { ui } from '../lib/ui';
import { getActiveWorkerVersion, getUpdateManager, useAppUpdate } from '../lib/update';

const btn = 'press h-11 rounded-full bg-s3 px-5 text-footnote font-semibold disabled:opacity-40';

/** Which build is running, which database version it opened, and whether an update is waiting. */
export function AboutData() {
  const u = useAppUpdate();
  const [runs, setRuns] = useState<AppRun[]>([]);
  const [worker, setWorker] = useState<string | null>(null);
  useEffect(() => {
    void getSetting<AppRun[]>('appRuns', []).then(setRuns);
    void getActiveWorkerVersion().then(setWorker);
  }, [u.ready]);
  const origin = classifyOrigin(location.hostname);
  const mgr = getUpdateManager();
  const built = APP_BUILT_AT ? new Date(APP_BUILT_AT).toLocaleString() : '';

  const rows: [string, string][] = [
    ['App version', `${APP_VERSION} (build ${APP_BUILD})`],
    ['Database version', `v${db.verno} (this app expects v${SCHEMA_VERSION})`],
    ['Opened as', isStandalone() ? 'Home Screen app' : 'Safari tab'],
    ['Address', origin.host],
  ];
  if (built) rows.splice(1, 0, ['Built', built]);
  if (worker) rows.push(['Offline files', worker]);

  return (
    <section className="mb-6 px-gutter" data-testid="about-data">
      <h2 className="eyebrow mb-2 pl-1">About & data</h2>
      <div className="overflow-hidden rounded-lg bg-s1 p-4">
        <dl className="space-y-1.5 text-footnote">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-fg-2">{k}</dt><dd className="min-w-0 break-all text-right font-medium text-fg">{v}</dd></div>
          ))}
        </dl>

        <p className={`mt-3 rounded-md p-3 text-footnote ${origin.kind === 'preview' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-fg-2'}`}>
          {origin.note} Songs are stored per address, and Safari and the Home Screen app keep separate libraries even for the same address. Import music where you will play it, and update only from this same address.
        </p>

        <div className="mt-3">
          {u.ready ? (
            <button className={`${btn} bg-fg text-black`} disabled={u.applying} onClick={() => void mgr?.apply()}>{u.applying ? 'Restarting…' : 'Restart to update'}</button>
          ) : (
            <button
              className={btn} disabled={!mgr || u.checking}
              onClick={async () => {
                const r = await mgr?.check();
                if (!r) return;
                ui.toast(r.kind === 'ready' ? 'Update ready: tap Restart' : r.kind === 'current' ? 'You have the latest version' : r.kind === 'behind' ? `Version ${r.remoteVersion} is out` : 'Could not check');
              }}
            >{u.installing ? 'Downloading update…' : u.checking ? 'Checking…' : 'Check for updates'}</button>
          )}
          <p className="mt-2 text-footnote" role="status" aria-live="polite" data-testid="update-status">
            {!mgr ? <span className="text-fg-3">Updates are checked in the installed app (not in development mode).</span>
              : u.ready || u.outcome?.kind === 'ready' ? <span className="font-semibold text-fg">New Cadence version available — Restart to update.</span>
              : u.installing ? <span className="text-fg-2">A new version is downloading…</span>
              : u.outcome?.kind === 'behind' ? <span className="text-amber-200">Version {u.outcome.remoteVersion} ({u.outcome.remoteBuild}) is deployed, but this phone has not received it yet. Fully close Cadence (swipe it away in the app switcher) and open it again, then check once more.</span>
              : u.outcome?.kind === 'offline' ? <span className="text-amber-200">Could not reach the server ({u.outcome.message}). Check your connection.</span>
              : u.outcome?.kind === 'current' ? <span className="text-fg-2">You are on the latest version ({APP_VERSION}, build {APP_BUILD}). Checked {u.lastChecked ? new Date(u.lastChecked).toLocaleTimeString() : ''}.</span>
              : <span className="text-fg-3">Tap to look for a new version.</span>}
          </p>
        </div>

        {runs.length > 0 && (
          <details className="mt-3 text-footnote text-fg-2">
            <summary className="cursor-pointer">Update history on this device</summary>
            <ul className="mt-2 space-y-1">
              {[...runs].reverse().map((r) => (
                <li key={r.at}>{new Date(r.at).toLocaleDateString()} · {r.version} ({r.build}) · database v{r.schema}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <p className="mt-2 px-1 text-caption text-fg-3">Updates replace only the app. Your songs, playlists and settings are not touched. Back up before big changes anyway.</p>
    </section>
  );
}
