import { useCallback, useEffect, useState } from 'react';
import App from './App';
import { RecoveryScreen } from './components/RecoveryScreen';
import { autoTrimAll, browserArtProcessor } from './lib/artEdits';
import { backfillTags } from './lib/backfill';
import { db, onDatabaseClosedByUpgrade, openDatabase, recordAppRun, type OpenResult } from './lib/db';
import { getPlayer } from './lib/player';
import { requestPersistence } from './lib/storage';
import { initUpdates } from './lib/update';

let started = false;
/** Background work that needs the open library. Runs once per page load. */
function startBackground() {
  if (started) return;
  started = true;
  void getPlayer().restore().catch(() => {});
  void requestPersistence();
  void recordAppRun();
  // Read genre / embedded-lyric tags for tracks imported before those existed (background, a few at a time).
  setTimeout(() => void backfillTags().catch(() => {}), 3000);
  // Trim transparent borders off covers that were imported earlier (originals are kept; undo in Settings).
  setTimeout(() => void autoTrimAll(browserArtProcessor).catch(() => {}), 6000);
}

/** Opens the library first. If that is impossible it shows a recovery screen, never an empty app and never a reset. */
export function Boot() {
  const [result, setResult] = useState<OpenResult | null>(null);
  const [closed, setClosed] = useState(false);

  const open = useCallback(() => {
    setResult(null);
    void openDatabase().then((r) => {
      setResult(r);
      if (r.ok) { onDatabaseClosedByUpgrade(() => setClosed(true)); startBackground(); }
    });
  }, []);
  useEffect(() => { open(); initUpdates(); }, [open]);

  if (!result) return <div className="fixed inset-0 bg-bg" aria-busy="true" aria-label="Opening your library" />;
  if (!result.ok) return <RecoveryScreen result={result} onRetry={open} />;
  return (
    <>
      <App />
      {closed && (
        <div className="fixed inset-x-0 top-0 z-[80] p-3" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)' }} role="alert">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-s3 p-3 ring-1 ring-white/10">
            <p className="flex-1 text-footnote">Cadence was updated in another window. Reload to continue. Your library is safe.</p>
            <button className="press h-9 rounded-full bg-fg px-4 text-footnote font-semibold text-black" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      )}
    </>
  );
}

// Exposed for tests and for support: which build is running and which database version it opened.
(window as unknown as { __CADENCE__?: unknown }).__CADENCE__ = {
  get schema() { return db.verno; },
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
  build: typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev',
};
