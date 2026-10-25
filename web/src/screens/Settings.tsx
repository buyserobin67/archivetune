import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportLibrary, importBackup } from '../lib/backup';
import { StorageQuotaError } from '../lib/errors';
import { APP_VERSION } from '../lib/appInfo';
import { isStandalone } from '../lib/pwa';
import { formatBytes, requestPersistence } from '../lib/storage';
import { useStorageStatus, useTracks } from '../lib/hooks';
import { ui } from '../lib/ui';
import { ImportButton } from '../components/ImportButton';
import { ChevronRight } from '../components/Icons';
import { clearListeningHistory } from '../lib/stats';
import { ART_ACCENT_KEY, artAccentOn, refreshAccent } from '../lib/accent';
import { AboutData } from '../components/AboutData';
import { DisplayDiagnostics } from '../components/DisplayDiagnostics';
import { ArtworkDiagnostics } from '../components/ArtworkDiagnostics';
import { ScreenHeader } from './common';

function Group({ title, footer, children }: { title: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6 px-gutter">
      <h2 className="eyebrow mb-2 pl-1">{title}</h2>
      <div className="overflow-hidden rounded-lg bg-s1 p-4">{children}</div>
      {footer && <p className="mt-2 px-1 text-caption text-fg-3">{footer}</p>}
    </section>
  );
}

const btn = 'press h-11 rounded-full bg-s3 px-5 text-footnote font-semibold disabled:opacity-40';

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
    <div className="page-enter">
      <ScreenHeader title="Settings" back="/" />

      <Group title="Storage" footer="iOS decides whether stored website data is kept. Keep your originals in Files and make backups.">
        {storage?.supported ? (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Storage used" aria-valuenow={Math.round(storage.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-[width] ${storage.level === 'ok' ? 'bg-accent' : storage.level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.max(1, Math.min(100, storage.ratio * 100))}%` }} />
            </div>
            <p className="mt-2 text-footnote text-fg-2">{formatBytes(storage.usage)} used of about {formatBytes(storage.quota)} · {formatBytes(storage.free)} free</p>
            {storage.level !== 'ok' && (
              <p className={`mt-3 rounded-md p-3 text-footnote ${storage.level === 'critical' ? 'bg-red-500/15 text-red-200' : 'bg-amber-400/10 text-amber-200'}`} role="alert">
                {storage.level === 'critical' ? 'Storage is almost full. New imports may fail. Export a backup and remove tracks you don’t need.' : 'Storage is getting low. Consider backing up and removing tracks.'}
              </p>
            )}
            <p className="mt-3 text-footnote text-fg-2">Persistent storage: <span className="font-semibold text-fg">{storage.persisted === null ? 'unknown' : storage.persisted ? 'granted' : 'not granted'}</span></p>
            {storage.persisted !== true && <button className={`${btn} mt-3`} onClick={() => void run('persist', async () => ((await requestPersistence()) ? 'Persistent storage granted' : 'iOS did not grant persistent storage'))}>Request persistent storage</button>}
          </>
        ) : <p className="text-footnote text-fg-2">This browser doesn’t report storage usage.</p>}
        {!isStandalone() && <p className="mt-3 rounded-md bg-white/5 p-3 text-footnote text-fg-2">Tip: Share → Add to Home Screen. The Home Screen app gets its own storage and the best background audio.</p>}
      </Group>

      <Group title="Your music">
        <p className="mb-3 text-footnote text-fg-2">{tracks?.length ?? 0} songs · files never leave this device.</p>
        <ImportButton label="Import from Files" />
        <Link to="/library/downloads" className="press mt-4 flex items-center justify-between text-body font-medium">
          Licensed downloads <ChevronRight size={18} className="text-fg-3" />
        </Link>
      </Group>

      <Group title="Appearance" footer="Off keeps the calm white accent. On, buttons and highlights take a light tone from the current cover.">
        <label className="flex items-center justify-between gap-4 text-body font-medium">
          Accent from artwork
          <input type="checkbox" role="switch" className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-s3 transition-colors checked:bg-fg [&::before]:block [&::before]:h-5 [&::before]:w-5 [&::before]:translate-x-0.5 [&::before]:translate-y-0.5 [&::before]:rounded-full [&::before]:bg-white [&::before]:transition-transform checked:[&::before]:translate-x-[1.375rem] checked:[&::before]:bg-black"
            defaultChecked={artAccentOn()} aria-label="Accent from artwork"
            onChange={(e) => { try { localStorage.setItem(ART_ACCENT_KEY, String(e.target.checked)); } catch { /* ignore */ } refreshAccent(); }} />
        </label>
      </Group>

      <Group title="Listening recap" footer="Your day, week, month and year recaps are built from a small log kept only on this device. It is included in backups.">
        <Link to="/recap" className="press flex items-center justify-between text-body font-medium">View recap <ChevronRight size={18} className="text-fg-3" /></Link>
        <button className={`${btn} mt-4`} onClick={() => { if (confirm('Clear your listening history? Songs and playlists are not affected.')) void run('clear-history', async () => { await clearListeningHistory(); return 'Listening history cleared'; }); }}>Clear listening history</button>
      </Group>

      <Group title="Backup & restore" footer="A full backup includes your audio and can be large. Save it to the Files app.">
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
        {busy && <p className="mt-3 text-footnote text-accent-text" role="status">Working…</p>}
      </Group>

      <AboutData />

      <ArtworkDiagnostics />

      <DisplayDiagnostics />

      <Group title="Known iOS limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-footnote text-fg-2">
          <li>Safari may evict website storage if the device is low on space or the app is unused for a long time. Persistent storage is requested, not guaranteed.</li>
          <li>Background and lock-screen playback usually works from the Home Screen app, but iOS can suspend web apps. It isn’t guaranteed.</li>
          <li>Playback must be started by a tap. Cadence can’t autoplay when opened.</li>
          <li>Lock-screen buttons depend on what your iOS version supports.</li>
          <li>Phone calls, Siri and other apps can interrupt audio. Tap play to resume.</li>
          <li>Safari plays MP3, AAC/M4A, WAV, AIFF, CAF and (on recent iOS) FLAC. OGG/Opus may not play.</li>
        </ul>
      </Group>

      <p className="px-gutter pb-4 text-center text-caption text-fg-3">Cadence Web {APP_VERSION} · music stays on your device · no analytics, no accounts</p>
    </div>
  );
}
