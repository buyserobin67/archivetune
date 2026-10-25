import { useRef, useState } from 'react';
import { importFiles } from '../lib/library';
import { requestPersistence } from '../lib/storage';
import { ui } from '../lib/ui';
import { PlusIcon } from './Icons';

/** Opens the iOS Files picker. Multi-select; audio only. */
export function ImportButton({ className = '', label = 'Import music' }: { className?: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    void requestPersistence();
    setProgress({ done: 0, total: files.length, name: files[0].name });
    const s = await importFiles(files, { onProgress: (done, total, name) => setProgress({ done, total, name }) });
    setProgress(null);
    if (input.current) input.current.value = '';
    const parts = [`${s.added.length} added`];
    if (s.duplicates.length) parts.push(`${s.duplicates.length} already in library`);
    if (s.failed.length) parts.push(`${s.failed.length} failed`);
    ui.toast(s.quotaExceeded ? 'Storage full. Nothing was corrupted; free up space and retry.' : parts.join(' · '));
  }

  return (
    <>
      <input ref={input} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.caf,.ogg,.opus" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      <button className={`press inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-violet-500 px-5 py-3 font-semibold shadow-lg shadow-violet-900/40 ${className}`} onClick={() => input.current?.click()} disabled={!!progress}>
        <PlusIcon size={20} />
        {progress ? `Importing ${Math.min(progress.done + 1, progress.total)}/${progress.total}…` : label}
      </button>
    </>
  );
}
