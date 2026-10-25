import { useRef, useState } from 'react';
import { exportLibrary, importBackup } from '../lib/backup';
import { StorageQuotaError } from '../lib/errors';
import { isStandalone } from '../lib/pwa';
import { formatBytes, requestPersistence } from '../lib/storage';
import { useStorageStatus, useTracks } from '../lib/hooks';
import { ui } from '../lib/ui';
import { directUrlTrack } from '../sources/directUrl';
import { catalogSource } from '../sources/catalog';
import { downloadSourceTrack } from '../sources/download';
import type { SourceTrack } from '../sources/types';
import { ImportButton } from '../components/ImportButton';
import { Page } from './common';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-ink-800 p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

const btn = 'press rounded-xl bg-white/10 px-4 py-3 text-[15px] font-medium disabled:opacity-40';
const field = 'w-full rounded-xl bg-white/10 px-4 py-3 text-[16px] outline-none placeholder:text-white/35 focus:ring-2 focus:ring-violet-500';

export default function Settings() {
  const tracks = useTracks();
  const [tick, setTick] = useState(0);
  const storage = useStorageStatus(`${tick}:${tracks?.length}`);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    try { ui.toast(await fn()); }
    catch (e) { ui.toast(e instanceof StorageQuotaError ? e.message : e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(null); setTick((n) => n + 1); }
  }

  const importRef = useRef<HTMLInputElement>(null);

  async function doExport(includeAudio: boolean) {
    await run('export', async () => {
      const blob = await exportLibrary({ includeAudio });
      const name = `cadence-${includeAudio ? 'full' : 'library'}-${new Date().toISOString().slice(0, 10)}.cadence`;
      const file = new File([blob], name, { type: 'application/octet-stream' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      // Share sheet lets iOS save straight to Files; fall back to a normal download.
      if (nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return 'Backup ready'; } catch (e) { if ((e as Error).name === 'AbortError') return 'Export cancelled'; }
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return `Exported ${formatBytes(blob.size)}`;
    });
  }

  return (
    <Page title="Settings">
      <Card title="Storage">
        {storage?.supported ? (
          <>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${storage.level === 'ok' ? 'bg-violet-500' : storage.level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.max(1, Math.min(100, storage.ratio * 100))}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/60">{formatBytes(storage.usage)} used of about {formatBytes(storage.quota)} · {formatBytes(storage.free)} free</p>
            {storage.level !== 'ok' && (
              <p className={`mt-2 rounded-xl p-3 text-sm ${storage.level === 'critical' ? 'bg-red-500/15 text-red-200' : 'bg-amber-400/10 text-amber-200'}`}>
                {storage.level === 'critical' ? 'Storage is almost full. New imports may fail. Export a backup and remove tracks you don’t need.' : 'Storage is getting low. Consider backing up and removing tracks.'}
              </p>
            )}
            <p className="mt-2 text-sm text-white/60">
              Persistent storage: {storage.persisted === null ? 'unknown' : storage.persisted ? 'granted' : 'not granted'}. iOS may still clear website data, so keep your originals in Files and make backups.
            </p>
            {storage.persisted !== true && <button className={`${btn} mt-3`} onClick={() => void run('persist', async () => ((await requestPersistence()) ? 'Persistent storage granted' : 'iOS did not grant persistent storage'))}>Request persistent storage</button>}
          </>
        ) : <p className="text-sm text-white/60">This browser doesn’t report storage usage.</p>}
        {!isStandalone() && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-white/60">Tip: Add Cadence to your Home Screen (Share → Add to Home Screen). Home Screen apps get more reliable storage and background audio than a Safari tab.</p>}
      </Card>

      <Card title="Your music">
        <p className="mb-3 text-sm text-white/60">{tracks?.length ?? 0} songs · files never leave this device.</p>
        <ImportButton label="Import from Files" />
      </Card>

      <Card title="Backup & restore">
        <p className="mb-3 text-sm text-white/60">A full backup includes your audio. It can be large; save it to the Files app.</p>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={!!busy} onClick={() => void doExport(true)}>Export with music</button>
          <button className={btn} disabled={!!busy} onClick={() => void doExport(false)}>Export library only</button>
          <button className={btn} disabled={!!busy} onClick={() => importRef.current?.click()}>Restore backup</button>
          <input ref={importRef} type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run('restore', async () => {
              const r = await importBackup(f);
              return `Restored ${r.tracksAdded} songs${r.tracksSkipped ? `, ${r.tracksSkipped} already here` : ''}${r.audioMissing ? `, ${r.audioMissing} need re-import` : ''}`;
            });
          }} />
        </div>
        {busy && <p className="mt-3 text-sm text-violet-300">Working…</p>}
      </Card>

      <LicensedDownloads />

      <Card title="Known iOS limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/65">
          <li>Safari may evict website storage if the device is low on space or the app is unused for a long time. Persistent storage is requested but not guaranteed. Keep originals in Files.</li>
          <li>Background and lock-screen playback usually works from the Home Screen app, but iOS can suspend web apps. It isn’t guaranteed.</li>
          <li>Playback must be started by a tap. Cadence can’t autoplay when opened.</li>
          <li>Lock-screen buttons depend on what iOS supports; seek and previous/next may differ by version.</li>
          <li>Phone calls, Siri and other apps can interrupt audio. Tap play to resume.</li>
          <li>Safari plays MP3, AAC/M4A, WAV, AIFF, CAF and (on recent iOS) FLAC. OGG/Opus may not play.</li>
          <li>Volume is controlled with the hardware buttons only.</li>
        </ul>
      </Card>

      <p className="pb-6 text-center text-xs text-white/30">Cadence Web · music stays on your device · no analytics, no accounts</p>
    </Page>
  );
}

function LicensedDownloads() {
  const [form, setForm] = useState({ url: '', title: '', artist: '', album: '', licenseName: '', licenseUrl: '', sourceUrl: '', ok: false });
  const [catalogUrl, setCatalogUrl] = useState('');
  const [catalog, setCatalog] = useState<SourceTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: k === 'ok' ? e.target.checked : e.target.value }));

  async function download(t: SourceTrack) {
    setBusy(true);
    try {
      const r = await downloadSourceTrack(t);
      ui.toast(r.status === 'added' ? `Added “${t.title}”` : r.status === 'duplicate' ? 'Already in your library' : r.reason);
    } catch (e) { ui.toast(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Add licensed music">
      <p className="mb-3 text-sm text-white/60">
        Only for files whose owner explicitly allows downloading (for example Creative Commons or your own hosting). No YouTube, Spotify or other streaming-service downloads. Attribution and license are saved with each track.
      </p>
      <div className="space-y-2">
        <input className={field} placeholder="https://… direct link to an audio file" value={form.url} onChange={set('url')} inputMode="url" autoCapitalize="none" autoCorrect="off" />
        <input className={field} placeholder="Title" value={form.title} onChange={set('title')} />
        <input className={field} placeholder="Artist (credited)" value={form.artist} onChange={set('artist')} />
        <input className={field} placeholder="Album (optional)" value={form.album} onChange={set('album')} />
        <input className={field} placeholder="License, e.g. CC BY 4.0" value={form.licenseName} onChange={set('licenseName')} />
        <input className={field} placeholder="License link (optional)" value={form.licenseUrl} onChange={set('licenseUrl')} inputMode="url" autoCapitalize="none" />
        <input className={field} placeholder="Source page (optional)" value={form.sourceUrl} onChange={set('sourceUrl')} inputMode="url" autoCapitalize="none" />
        <label className="flex items-start gap-3 py-1 text-sm text-white/70">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-violet-500" checked={form.ok} onChange={set('ok')} />
          I confirm the rights holder permits downloading and keeping this file.
        </label>
        <button className={btn} disabled={busy || !form.url || !form.title || !form.artist || !form.licenseName} onClick={() => void download(directUrlTrack({ ...form, confirmedDownloadAllowed: form.ok, album: form.album }))}>
          {busy ? 'Downloading…' : 'Download to library'}
        </button>
      </div>
      <h3 className="mb-2 mt-6 font-semibold">Catalog (JSON)</h3>
      <div className="flex gap-2">
        <input className={field} placeholder="https://…/catalog.json" value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} inputMode="url" autoCapitalize="none" />
        <button className={btn} disabled={!catalogUrl || busy} onClick={async () => {
          try { setCatalog(await catalogSource(catalogUrl).list()); } catch (e) { ui.toast(e instanceof Error ? e.message : 'Could not load catalog'); }
        }}>Load</button>
      </div>
      {catalog && (
        <ul className="mt-3 divide-y divide-white/10">
          {catalog.length === 0 && <li className="py-2 text-sm text-white/50">No tracks in this catalog.</li>}
          {catalog.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{t.title}</div>
                <div className="truncate text-xs text-white/50">{t.artist} · {t.license.name || 'no license stated'}</div>
              </div>
              <button className={btn} disabled={busy || !t.license.allowsDownload} onClick={() => void download(t)}>{t.license.allowsDownload ? 'Get' : 'Not allowed'}</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
