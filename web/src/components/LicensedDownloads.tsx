import { useState } from 'react';
import { ui } from '../lib/ui';
import { catalogSource } from '../sources/catalog';
import { directUrlTrack } from '../sources/directUrl';
import { downloadSourceTrack } from '../sources/download';
import type { SourceTrack } from '../sources/types';

const btn = 'press h-11 rounded-full bg-s3 px-5 text-body font-semibold disabled:opacity-40';
const field = 'h-12 w-full rounded-lg bg-s3 px-4 outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent';

/** Adds music from sources that explicitly permit downloading. Attribution and license are stored with each track. */
export function LicensedDownloads() {
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
    <div className="pb-4">
      <p className="mb-4 text-footnote text-fg-2">
        Only for files whose owner explicitly allows downloading (for example Creative Commons, or your own hosting). YouTube, Spotify and other streaming services are not supported. Attribution and license are saved with each track.
      </p>
      <div className="space-y-2">
        <input className={field} placeholder="https://… direct link to an audio file" value={form.url} onChange={set('url')} inputMode="url" autoCapitalize="none" autoCorrect="off" aria-label="Audio URL" />
        <input className={field} placeholder="Title" value={form.title} onChange={set('title')} aria-label="Title" />
        <input className={field} placeholder="Artist (credited)" value={form.artist} onChange={set('artist')} aria-label="Artist" />
        <input className={field} placeholder="Album (optional)" value={form.album} onChange={set('album')} aria-label="Album" />
        <input className={field} placeholder="License, e.g. CC BY 4.0" value={form.licenseName} onChange={set('licenseName')} aria-label="License" />
        <input className={field} placeholder="License link (optional)" value={form.licenseUrl} onChange={set('licenseUrl')} inputMode="url" autoCapitalize="none" aria-label="License link" />
        <input className={field} placeholder="Source page (optional)" value={form.sourceUrl} onChange={set('sourceUrl')} inputMode="url" autoCapitalize="none" aria-label="Source page" />
        <label className="flex items-start gap-3 py-2 text-footnote text-fg-2">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent-rgb))]" checked={form.ok} onChange={set('ok')} />
          I confirm the rights holder permits downloading and keeping this file.
        </label>
        <button className={btn} disabled={busy || !form.url || !form.title || !form.artist || !form.licenseName} onClick={() => void download(directUrlTrack({ ...form, confirmedDownloadAllowed: form.ok }))}>
          {busy ? 'Downloading…' : 'Download to library'}
        </button>
      </div>
      <h3 className="mb-2 mt-7 text-body-lg font-semibold">Catalog (JSON)</h3>
      <div className="flex gap-2">
        <input className={field} placeholder="https://…/catalog.json" value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} inputMode="url" autoCapitalize="none" aria-label="Catalog URL" />
        <button className={btn} disabled={!catalogUrl || busy} onClick={async () => {
          try { setCatalog(await catalogSource(catalogUrl).list()); } catch (e) { ui.toast(e instanceof Error ? e.message : 'Could not load catalog'); }
        }}>Load</button>
      </div>
      {catalog && (
        <ul className="mt-3 divide-y divide-line">
          {catalog.length === 0 && <li className="py-2 text-footnote text-fg-3">No tracks in this catalog.</li>}
          {catalog.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium">{t.title}</div>
                <div className="truncate text-caption text-fg-2">{t.artist} · {t.license.name || 'no license stated'}</div>
              </div>
              <button className={btn} disabled={busy || !t.license.allowsDownload} onClick={() => void download(t)}>{t.license.allowsDownload ? 'Get' : 'Not allowed'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
