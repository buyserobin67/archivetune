import { useRef, useState } from 'react';
import { importFiles } from '../lib/library';
import { requestPersistence } from '../lib/storage';
import { ui } from '../lib/ui';
import { PlusIcon } from './Icons';

/** Opens the iOS Files picker (multi-select, audio only). `icon` = compact circular button for headers. */
export function ImportButton({ variant = 'pill', label = 'Import music', className = '' }: { variant?: 'pill' | 'icon' | 'compact'; label?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    void requestPersistence();
    setProgress({ done: 0, total: files.length });
    const s = await importFiles(files, { onProgress: (done, total) => setProgress({ done, total }) });
    setProgress(null);
    if (input.current) input.current.value = '';
    const parts = [`${s.added.length} added`];
    if (s.duplicates.length) parts.push(`${s.duplicates.length} already in library`);
    if (s.failed.length) parts.push(`${s.failed.length} failed`);
    if (s.lyricsAttached) parts.push(`${s.lyricsAttached} lyrics`);
    ui.toast(s.quotaExceeded ? 'Storage full. Nothing was corrupted; free up space and retry.' : parts.join(' · '));
  }

  const busy = !!progress;
  const status = progress ? `Importing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : label;
  return (
    <>
      <input ref={input} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.caf,.ogg,.opus,.lrc,.ttml,.txt" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      {variant === 'icon' || variant === 'compact' ? variant === 'icon' ? (
        <button
          className={`press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-black disabled:opacity-90 ${className}`}
          onClick={() => input.current?.click()} disabled={busy} aria-label={status}
        >
          {busy ? <span className="text-caption font-bold tabular-nums">{Math.min(progress!.done + 1, progress!.total)}/{progress!.total}</span> : <PlusIcon size={20} />}
        </button>
      ) : (
        <button
          className={`press inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-fg px-4 text-footnote font-semibold text-black ${className}`}
          onClick={() => input.current?.click()} disabled={busy}
        >
          <PlusIcon size={16} />
          {busy ? status : label}
        </button>
      ) : (
        <button
          className={`press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fg px-6 text-body font-semibold text-black ${className}`}
          onClick={() => input.current?.click()} disabled={busy}
        >
          <PlusIcon size={20} />
          {busy ? status : label}
        </button>
      )}
    </>
  );
}
