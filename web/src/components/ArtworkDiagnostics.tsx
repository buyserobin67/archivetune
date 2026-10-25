import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { analyzeTrack, AUTO_TRIM_KEY, browserArtProcessor, isAutoTrimOn, trimTrack, undoAll, useOriginal, type ArtAnalysis } from '../lib/artEdits';
import { getOriginalArtBlob } from '../lib/artSource';
import { formatBytes } from '../lib/storage';
import { ui } from '../lib/ui';
import type { Track } from '../lib/types';

const btn = 'press h-10 rounded-full bg-s3 px-4 text-footnote font-semibold disabled:opacity-40';

interface Row {
  track: Track;
  analysis: ArtAnalysis | null;
  render: RenderCheck | null;
  edit: 'trimmed' | 'original' | 'none';
}

export interface RenderCheck { ok: boolean; box: string; fit: string; natural: string }

/**
 * Draws the real image in a 100px square exactly the way Art does, and measures it. If the box is not 100x100 with
 * object-fit: cover, the bug is in rendering; if it is, any bars come from the image's own pixels.
 */
export async function renderCheck(blob: Blob): Promise<RenderCheck> {
  const url = URL.createObjectURL(blob);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:100px;aspect-ratio:1/1;overflow:hidden;';
  const img = document.createElement('img');
  img.className = 'absolute inset-0 h-full w-full object-cover';
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
  host.appendChild(img);
  document.body.appendChild(host);
  try {
    img.src = url;
    await img.decode();
    const r = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    return { ok: Math.round(r.width) === 100 && Math.round(r.height) === 100 && fit === 'cover', box: `${Math.round(r.width)}x${Math.round(r.height)}`, fit, natural: `${img.naturalWidth}x${img.naturalHeight}` };
  } finally {
    host.remove();
    URL.revokeObjectURL(url);
  }
}

const mimeName = (m: string) => (m.split('/')[1] ?? m ?? '?').toUpperCase();

/** Settings card: reports what is really inside each cover, and trims borders without touching the original image. */
export function ArtworkDiagnostics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const auto = useLiveQuery(() => isAutoTrimOn(), []);
  const edits = useLiveQuery(() => db.artEdits.toArray(), []);
  const trimmed = (edits ?? []).filter((e) => e.blob && !e.disabled).length;

  async function scan() {
    setBusy(true);
    try {
      const proc = browserArtProcessor;
      if (!proc) throw new Error('Image tools are not available in this browser');
      const tracks = (await db.tracks.toArray()).filter((t) => t.hasArt);
      const out: Row[] = [];
      for (const track of tracks) {
        const analysis = await analyzeTrack(track.id, proc, { flat: true });
        const original = await getOriginalArtBlob(track.id);
        const render = original ? await renderCheck(original).catch(() => null) : null;
        const e = await db.artEdits.get(track.id);
        out.push({ track, analysis, render, edit: e?.disabled ? 'original' : e?.blob ? 'trimmed' : 'none' });
      }
      setRows(out);
      ui.toast(out.length ? `Scanned ${out.length} cover${out.length === 1 ? '' : 's'}` : 'No embedded artwork found');
    } catch (e) { ui.toast(e instanceof Error ? e.message : 'Scan failed'); }
    finally { setBusy(false); }
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); ui.toast(msg); await scan(); } catch { ui.toast('Something went wrong'); setBusy(false); }
  }

  const trimAll = () => act(async () => {
    for (const r of rows ?? []) if (r.analysis?.trimWorthIt && r.edit !== 'trimmed') await trimTrack(r.track.id, browserArtProcessor!, { flat: true });
  }, 'Trimmed. Originals are kept');

  async function copyReport() {
    const report = (rows ?? []).map((r) => ({
      title: r.track.title, mime: r.analysis?.mime, bytes: r.analysis?.bytes, size: r.analysis ? `${r.analysis.report.width}x${r.analysis.report.height}` : null,
      hasAlpha: r.analysis?.report.hasAlpha, transparentShare: r.analysis ? Number(r.analysis.report.transparentShare.toFixed(3)) : null,
      kind: r.analysis?.report.kind, borders: r.analysis?.report.borders, verdict: r.analysis?.verdict, renderCheck: r.render, shown: r.edit,
    }));
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); ui.toast('Report copied'); } catch { ui.toast('Could not copy'); }
  }

  const needsTrim = (rows ?? []).filter((r) => r.analysis?.trimWorthIt && r.edit !== 'trimmed').length;
  return (
    <section className="mb-6 px-gutter" aria-labelledby="art-title">
      <h2 id="art-title" className="eyebrow mb-2 pl-1">Artwork</h2>
      <div className="overflow-hidden rounded-lg bg-s1 p-4">
        <p className="text-footnote text-fg-2">
          Some embedded covers have transparent or flat borders baked into the image. Those show as bars no matter how the app draws them.
          Trimming makes a separate copy; the original image inside your file is never changed, and you can undo.
        </p>
        <label className="mt-3 flex items-center gap-3 text-footnote text-fg-2">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={auto ?? true}
            onChange={async (e) => { await db.settings.put({ key: AUTO_TRIM_KEY, value: e.target.checked }); }} />
          Automatically trim transparent borders (new imports and existing songs)
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={`${btn} !bg-fg !text-black`} disabled={busy} onClick={() => void scan()}>{busy ? 'Scanning…' : 'Scan artwork'}</button>
          {rows && needsTrim > 0 && <button className={btn} disabled={busy} onClick={() => void trimAll()}>Trim {needsTrim} cover{needsTrim === 1 ? '' : 's'}</button>}
          {trimmed > 0 && <button className={btn} disabled={busy} onClick={() => void act(() => undoAll(), 'All covers restored to the original')}>Undo all ({trimmed})</button>}
          {rows && rows.length > 0 && <button className={btn} disabled={busy} onClick={() => void copyReport()}>Copy report</button>}
        </div>
        {rows && (
          <ul className="mt-3 divide-y divide-line" aria-label="Artwork scan results">
            {rows.length === 0 && <li className="py-2 text-footnote text-fg-3">No songs with embedded artwork.</li>}
            {rows.map((r) => (
              <li key={r.track.id} className="py-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-medium">{r.track.title}</div>
                    {r.analysis ? (
                      <>
                        <div className="text-caption text-fg-2">
                          {r.analysis.report.width}×{r.analysis.report.height} · {mimeName(r.analysis.mime)} · {formatBytes(r.analysis.bytes)}
                          {r.analysis.report.hasAlpha ? ` · alpha, ${Math.round(r.analysis.report.transparentShare * 100)}% transparent` : ' · opaque'}
                        </div>
                        <div className={`text-caption ${r.analysis.trimWorthIt ? 'text-art-text' : 'text-fg-3'}`}>{r.analysis.verdict}</div>
                        {r.render && <div className="text-caption text-fg-3">Render check: {r.render.ok ? 'OK' : 'MISMATCH'} (box {r.render.box}, {r.render.fit})</div>}
                      </>
                    ) : <div className="text-caption text-fg-3">Could not read this image</div>}
                  </div>
                  {r.edit === 'trimmed' ? (
                    <button className={btn} disabled={busy} onClick={() => void act(() => useOriginal(r.track.id), 'Using the original')}>Use original</button>
                  ) : r.analysis?.trimWorthIt ? (
                    <button className={btn} disabled={busy} onClick={() => void act(() => trimTrack(r.track.id, browserArtProcessor!, { flat: true }), 'Trimmed')}>Trim</button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
