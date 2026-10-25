import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { currentLineIndex, displayLyrics, INTERLUDE_MIN, lineSpan, stanzas, wordProgress, wordTimings } from '../lib/lrc';
import { readLyricFile, saveLyricsText } from '../lib/lyrics';
import { getPlayer, usePlaybackTime } from '../lib/player';
import { prefersReducedMotion, ui } from '../lib/ui';
import type { LyricLine, Track } from '../lib/types';
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

/**
 * The line being sung, lit word by word with a soft edge. Reads the audio clock every frame (timeupdate is only ~4 Hz on
 * Safari) and writes a CSS variable per word, so it never re-renders React. Word-timed LRC uses its stamps; other
 * lines spread the sweep by letters.
 */
function KaraokeLine({ line, nextT, offset }: { line: LyricLine; nextT?: number; offset: number }) {
  const words = useMemo(() => wordTimings(line, nextT), [line, nextT]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const audio = getPlayer().audio;
    const frame = () => {
      const now = audio.currentTime - offset;
      words.forEach((w, k) => {
        const el = refs.current[k];
        if (el) el.style.setProperty('--k', `${(-15 + wordProgress(w, now) * 130).toFixed(1)}%`);
      });
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [words, offset]);
  return <>{words.map((w, k) => <span key={k} ref={(el) => { refs.current[k] = el; }} className="karaoke">{w.text}</span>)}</>;
}

const FADE = 'linear-gradient(to bottom, transparent, #000 7%, #000 90%, transparent)';
const scroller = 'scroll-y hide-scroll relative min-h-0 flex-1 overscroll-contain px-gutter';

/** Lyrics area. Synced: active line lit, others dim, follows playback, tap to seek. Plain: even, calm reading text that never reacts to playback. */
export function LyricsView({ track }: { track: Track }) {
  const stored = useLiveQuery(() => db.lyrics.get(track.id).then((l) => l ?? null), [track.id]);
  // Cleaned on read: lyrics saved before the cleaner existed lose their Title/Artist/Album headers without being rewritten.
  const lyrics = useMemo(() => (stored ? displayLyrics(stored) : stored), [stored]);
  const [paste, setPaste] = useState(false);
  const picker = useLyricFilePicker(track);

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
  return lyrics.kind === 'synced'
    ? <SyncedLyrics key={track.id} trackId={track.id} lines={lyrics.lines ?? []} offset={lyrics.offset ?? 0} />
    : <PlainLyrics key={track.id} text={lyrics.text ?? ''} />;
}

/** Plain text. Deliberately does not read playback time: nothing here can change, fade or move while a song plays. */
function PlainLyrics({ text }: { text: string }) {
  return (
    <div className={scroller} data-kind="plain" aria-label="Lyrics" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
      <article className="pb-10 pt-6" data-plain-lyrics>
        <p className="mb-5 text-caption uppercase tracking-wider text-fg-3">Lyrics · not time-synced</p>
        <div className="space-y-7">
          {stanzas(text).map((st, n) => (
            <div key={n} className="space-y-1.5 text-[1.0625rem] font-medium leading-[1.65] text-fg/90">
              {st.map((line, k) => <p key={k} className="break-words">{line}</p>)}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function SyncedLyrics({ trackId, lines, offset }: { trackId: string; lines: LyricLine[]; offset: number }) {
  const { currentTime } = usePlaybackTime();
  // A positive offset shows every line later: compare the lines against an earlier song time.
  const idx = currentLineIndex(lines, currentTime - offset);
  const box = useRef<HTMLDivElement>(null);
  const holdUntil = useRef(0);
  const reduce = prefersReducedMotion();

  useEffect(() => {
    const c = box.current;
    if (!c || idx < 0 || Date.now() < holdUntil.current) return;
    const line = c.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    if (!line) return;
    c.scrollTo({ top: line.offsetTop - c.clientHeight * 0.38 + line.clientHeight / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [idx, trackId, reduce]);

  const hold = () => { holdUntil.current = Date.now() + 3500; };
  return (
    <div ref={box} className={scroller} data-kind="synced" aria-label="Lyrics" onTouchStart={hold} onTouchMove={hold} onWheel={hold} style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
      <div className="h-[30%]" aria-hidden="true" />
      <ol className="space-y-5 pb-2">
        {lines.map((l, i) => {
          const active = i === idx;
          const gap = !l.text;
          const interlude = gap && lineSpan(lines, i) > INTERLUDE_MIN;
          return (
            <li key={i} data-line={i}>
              {!gap ? (
                <button
                  className="block w-full origin-left break-words text-left text-title-lg font-semibold leading-snug"
                  style={{ opacity: active ? 1 : 0.34, transition: reduce ? 'none' : 'opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out)', transform: !reduce && !active ? 'scale(.96)' : undefined }}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => getPlayer().seek(l.t + offset)}
                >{active && !reduce ? <KaraokeLine line={l} nextT={lines[i + 1]?.t} offset={offset} /> : l.text}</button>
              ) : interlude ? (
                <div className="flex h-8 items-center gap-1.5" data-interlude role="img" aria-label="Instrumental" style={{ opacity: active ? 0.9 : 0.18, transition: reduce ? 'none' : 'opacity var(--dur-slow)' }}>
                  {[0, 1, 2].map((d) => <span key={d} className={`h-2 w-2 rounded-full bg-fg ${active && !reduce ? 'animate-pulse' : ''}`} style={{ animationDelay: `${d * 200}ms` }} />)}
                </div>
              ) : <div className="h-3" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <div className="h-[45%]" aria-hidden="true" />
    </div>
  );
}
