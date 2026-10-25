import { useState } from 'react';
import { getPlayer } from '../lib/player';
import { getUpdateManager, useAppUpdate } from '../lib/update';

/** "New Cadence version available — Restart to update." Nothing is replaced until the user taps Restart. */
export function UpdateBanner() {
  const u = useAppUpdate();
  const [later, setLater] = useState(false);
  if (!u.ready || later) return null;
  return (
    <div role="status" aria-live="polite" className="absolute inset-x-0 top-0 z-[55] animate-enter px-3" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)' }}>
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-s3 p-3 shadow-float">
        <p className="min-w-0 flex-1 text-footnote text-fg">
          <b>New Cadence version available</b> — Restart to update.
          <span className="mt-0.5 block text-caption text-fg-3">Your music and playlists stay on this device.</span>
        </p>
        <button className="press h-9 shrink-0 rounded-full bg-fg px-4 text-footnote font-semibold text-black disabled:opacity-60" disabled={u.applying}
          onClick={() => void getUpdateManager()?.apply(async () => { getPlayer().pause(); await new Promise((r) => setTimeout(r, 150)); })}>
          {u.applying ? 'Restarting…' : 'Restart'}
        </button>
        {!u.applying && <button className="press shrink-0 text-footnote font-semibold text-fg-2" onClick={() => setLater(true)}>Later</button>}
      </div>
    </div>
  );
}
