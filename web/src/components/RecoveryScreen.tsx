import { useState } from 'react';
import { appLabel } from '../lib/appInfo';
import { SCHEMA_VERSION, type OpenResult } from '../lib/db';

type Failed = Extract<OpenResult, { ok: false }>;

const COPY: Record<Failed['reason'], { title: string; body: string }> = {
  newer: {
    title: 'This library is from a newer Cadence',
    body: 'Your music was saved by a newer version of the app than the one that just loaded (an older copy may have been served from the cache). Nothing was changed or deleted. Close Cadence completely and open it again; if you are on a preview address, open your main Cadence address instead.',
  },
  unavailable: {
    title: 'Storage is not available',
    body: 'Your browser did not allow Cadence to open its storage (private browsing, or storage blocked in settings). Nothing was changed. Open Cadence from your Home Screen icon in a normal window.',
  },
  blocked: {
    title: 'Another Cadence window is open',
    body: 'An older Cadence window is still using the library and is blocking the update. Close all Cadence windows or tabs, then try again. Nothing was changed.',
  },
  failed: {
    title: 'Could not open your library',
    body: 'Opening the library failed, so the update was not applied. Nothing was deleted: the library stays at its previous version on this device. Try again; if it keeps failing, copy the details and report them.',
  },
};

/** Shown instead of the app when the library cannot be opened. It offers no destructive action on purpose. */
export function RecoveryScreen({ result, onRetry }: { result: Failed; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const c = COPY[result.reason];
  const details = `Cadence ${appLabel()} · expects database v${SCHEMA_VERSION}\n${result.reason}: ${result.message}`;
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-bg px-gutter py-8 text-center" role="alert">
      <h1 className="text-title font-bold">{c.title}</h1>
      <p className="max-w-sm text-body text-fg-2">{c.body}</p>
      <p className="max-w-sm text-caption text-fg-3">Cadence never deletes your library automatically.</p>
      <div className="flex gap-2">
        <button className="press h-11 rounded-full bg-fg px-6 font-semibold text-black" onClick={onRetry}>Try again</button>
        <button className="press h-11 rounded-full bg-s2 px-6 font-semibold" onClick={() => location.reload()}>Reload</button>
      </div>
      <button className="press text-footnote text-fg-2 underline" onClick={async () => { try { await navigator.clipboard.writeText(details); setCopied(true); } catch { /* ignore */ } }}>
        {copied ? 'Copied' : 'Copy details'}
      </button>
      <pre className="max-w-sm whitespace-pre-wrap break-words text-left text-caption text-fg-3">{details}</pre>
    </div>
  );
}
