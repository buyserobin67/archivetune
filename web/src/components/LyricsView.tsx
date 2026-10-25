import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { currentLineIndex } from '../lib/lrc';
import { readLyricFile, saveLyricsText } from '../lib/lyrics';
import { getPlayer, usePlaybackTime } from '../lib/player';
import { prefersReducedMotion, ui } from '../lib/ui';
import type { Track } from '../lib/types';
import { QuoteIcon } from './Icons';
import { Sheet } from './Sheets';

/** Opens the iOS Files picker for a .lrc / .txt lyric file and saves it for `track`. */
export function useLyricFilePicker(track: Track) {
  const input = useRef<HTMLInputElement>(null);
  const el = (
    <input ref={input} type="file" accept=".lrc,.txt,text/plain" className="hidden" onChange={async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      const ok = await saveLyricsText(track.id, await readLyricFile(f), 'lrc');
      ui.toast(ok ? (ok.kind === 'synced' ? 'Synced lyrics added' : 'Lyrics added') : 'That file has no lyrics');
    }} />
  );
  return { el, open: () => input.current?.click() };
}

export function PasteLyricsSheet({ track, onClose }: { track: Track; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Sheet title="Paste lyrics" onClose={onClose} tall>
      <p className="mb-3 text-footnote text-fg-2">Paste your own lyrics. Lines starting with [mm:ss.xx] become time-synced.</p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} placeholder="Lyrics for this track" aria-label="Lyrics text"
        className="h-[40dvh] w-full resize-none rounded-lg bg-s3 p-3 text-body outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-white/40"
      />
      <button
        className="press mt-3 h-11 w-full rounded-full bg-fg font-semibold text-black disabled:opacity-40" disabled={!text.trim()}
        onClick={async () => { const ok = await saveLyricsText(track.id, text, 'manual'); ui.toast(ok ? 'Lyrics saved' : 'Nothing to save'); if (ok) onClose(); }}
      >Save lyrics</button>
    </Sheet>
  );
}

/** Full-height lyrics: current line prominent, neighbours dimmed, smooth auto-scroll, tap a line to seek. */
export function LyricsView({ track }: { track: Track }) {
  const lyrics = useLiveQuery(() => db.lyrics.get(track.id).then((l) => l ?? null), [track.id]);
  const { currentTime } = usePlaybackTime();
  const box = useRef<HTMLDivElement>(null);
  const holdUntil = useRef(0);
  const [paste, setPaste] = useState(false);
  const picker = useLyricFilePicker(track);
  const lines = lyrics?.kind === 'synced' ? lyrics.lines ?? [] : [];
  const idx = currentLineIndex(lines, currentTime);

  useEffect(() => {
    const c = box.current;
    if (!c || idx < 0 || Date.now() < holdUntil.current) return;
    const line = c.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    if (!line) return;
    c.scrollTo({ top: line.offsetTop - c.clientHeight / 2 + line.clientHeight / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [idx, track.id, lyrics?.kind]);

  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [track.id]);

  if (lyrics === undefined) return <div className="min-h-0 flex-1" />;
  if (lyrics === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center animate-fade">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-s2 text-fg-2"><QuoteIcon size={22} /></div>
        <h3 className="text-body-lg font-semibold">No lyrics for this track</h3>
        <p className="mt-1 max-w-xs text-footnote text-fg-2">Cadence doesn’t download lyrics. Add a .lrc or .txt file you own, paste text, or import a song that has lyrics embedded.</p>
        <div className="mt-4 flex gap-2">
          <button className="press h-10 rounded-full bg-fg px-4 text-footnote font-semibold text-black" onClick={picker.open}>Add .lrc / .txt</button>
          <button className="press h-10 rounded-full bg-s2 px-4 text-footnote font-semibold" onClick={() => setPaste(true)}>Paste</button>
        </div>
        {picker.el}
        {paste && <PasteLyricsSheet track={track} onClose={() => setPaste(false)} />}
      </div>
    );
  }
  const hold = () => { holdUntil.current = Date.now() + 3500; };
  return (
    <div
      ref={box}
      className="scroll-y hide-scroll relative min-h-0 flex-1 px-gutter"
      onTouchStart={hold} onTouchMove={hold} onWheel={hold}
      style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 12%, #000 80%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 12%, #000 80%, transparent)' }}
      aria-label="Lyrics"
    >
      <div className="h-[34%]" aria-hidden="true" />
      {lyrics.kind === 'synced' ? (
        <ol className="space-y-4 pb-2">
          {lines.map((l, i) => (
            <li key={i} data-line={i}>
              {l.text ? (
                <button
                  className="block w-full origin-left text-left text-title-lg font-extrabold leading-tight transition-[opacity,transform] duration-slow ease-out"
                  style={{ opacity: i === idx ? 1 : Math.abs(i - idx) === 1 ? 0.5 : 0.28, transform: i === idx ? 'scale(1)' : 'scale(.92)' }}
                  aria-current={i === idx ? 'true' : undefined}
                  onClick={() => getPlayer().seek(l.t)}
                >{l.text}</button>
              ) : <div className="h-4" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      ) : (
        <div>
          <p className="mb-3 text-caption text-fg-3">Not time-synced</p>
          <p className="whitespace-pre-wrap text-title font-bold leading-snug text-fg/90">{lyrics.text}</p>
        </div>
      )}
      <div className="h-[40%]" aria-hidden="true" />
    </div>
  );
}
