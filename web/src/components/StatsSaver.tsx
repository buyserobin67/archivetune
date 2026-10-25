import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { exportStats, importStats, statsSaveStatus } from '../lib/stats';
import { ui } from '../lib/ui';

const btn = 'press h-11 rounded-full bg-s3 px-5 text-footnote font-semibold disabled:opacity-40';

/** Keeps your listening minutes safe: a tiny file in Files that survives deleting or reinstalling the Home Screen app. */
export function StatsSaver({ compact }: { compact?: boolean }) {
  const status = useLiveQuery(() => statsSaveStatus(), []);
  const count = useLiveQuery(() => db.plays.count(), []);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const stale = !!count && (status?.savedAt == null || status.newSince >= 10);

  async function save() {
    setBusy(true);
    try {
      const blob = await exportStats();
      const name = `cadence-stats-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); ui.toast('Stats saved. Keep it in Files.'); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      ui.toast('Stats file downloaded');
    } finally { setBusy(false); }
  }

  return (
    <div className={compact ? '' : 'rounded-xl bg-s1 p-4'} data-testid="stats-saver">
      {stale && (
        <p className="mb-3 rounded-md bg-amber-400/10 p-3 text-footnote text-amber-200" role="status">
          {status?.savedAt == null ? 'Your listening history only exists on this phone.' : `${status.newSince} new listens since your last saved copy.`} Save a stats file to Files so it survives if the app is deleted.
        </p>
      )}
      <p className="text-footnote text-fg-2">
        Deleting the Home Screen icon erases everything the app stored, including your minutes and streak. A stats file is tiny, has no music in it, and brings them back.
        {status?.savedAt ? ` Last saved ${new Date(status.savedAt).toLocaleDateString()}.` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} disabled={busy || !count} onClick={() => void save()}>Save stats file</button>
        <button className={btn} onClick={() => input.current?.click()}>Restore stats file</button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { const r = await importStats(f); ui.toast(r.added ? `Restored ${r.added} listens` : 'Nothing new in that file'); } catch (err) { ui.toast(err instanceof Error ? err.message : 'Could not read that file'); }
        }} />
      </div>
    </div>
  );
}
