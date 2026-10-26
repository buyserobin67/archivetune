import { useEffect, useState } from 'react';
import { APP_BRANCH, APP_BUILD, APP_BUILT_AT, APP_VERSION } from '../lib/appInfo';
import { db, getSetting, SCHEMA_VERSION, type AppRun } from '../lib/db';
import { classifyOrigin } from '../lib/origin';
import { isStandalone } from '../lib/pwa';
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
  const origin = classifyOrigin(location.hostname, APP_BRANCH);
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

        <div className={`mt-3 rounded-md p-3 text-footnote ${origin.kind === 'preview' || origin.kind === 'snapshot' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-fg-2'}`} data-origin={origin.kind}>
          <p>{origin.note}{origin.kind !== 'snapshot' && ' Songs are stored per address, and Safari and the Home Screen app keep separate libraries even for the same address. Import music where you will play it, and update only from this same address.'}</p>
          {origin.liveUrls && (
            <ul className="mt-2 space-y-1">
              {origin.liveUrls.map((l) => (
                <li key={l.url}><span className="text-amber-200/70">{l.label}: </span><a className="break-all font-semibold underline" href={l.url} target="_blank" rel="noreferrer">{l.url.replace(/^https:\/\//, '').replace(/\/$/, '')}</a></li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {u.ready ? (
            <button className={`${btn} bg-fg text-black`} disabled={u.applying} onClick={() => void mgr?.apply()}>{u.applying ? 'Restarting…' : 'Restart to update'}</button>
          ) : (
            <button className={btn} disabled={!mgr || u.checking || u.installing} onClick={() => void mgr?.check()}>{u.checking ? 'Checking…' : u.installing ? 'Downloading…' : 'Check for updates'}</button>
          )}
          <span className="text-caption text-fg-3" role="status">
            {u.ready ? 'New Cadence version available — Restart to update.'
              : u.installing ? 'Downloading the new version…'
              : u.error ? u.error
              : u.lastChecked && origin.kind === 'snapshot' ? 'No newer version can appear at this fixed address'
              : u.lastChecked ? `Up to date · checked ${new Date(u.lastChecked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : mgr ? '' : 'Updates are checked in the installed app'}
          </span>
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
