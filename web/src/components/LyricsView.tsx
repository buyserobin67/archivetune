import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { currentLineIndex, displayLyrics, INTERLUDE_MIN, lineSpan, linesFromTaps, linesToSync, stanzas, toLrcText, wordProgress, wordTimings } from '../lib/lrc';
import { readLyricFile, saveLyricsText } from '../lib/lyrics';
import { getPlayer, usePlayer, usePlaybackTime } from '../lib/player';
import { haptic } from '../lib/haptics';
import { LINE_SPRING } from '../lib/spring';
import { formatTime } from '../lib/storage';
import { prefersReducedMotion, ui } from '../lib/ui';
import type { LyricLine, Track } from '../lib/types';
import { PauseIcon, PlayIcon, QuoteIcon } from './Icons';
import { Sheet } from './Sheets';

/** Opens the iOS Files picker for a .lrc / .ttml / .txt lyric file and saves it for `track`. */
export function useLyricFilePicker(track: Track) {
  const input = useRef<HTMLInputElement>(null);
  const el = (
    // No `accept` filter: iOS greys out file types it does not know (.lrc, .ttml). The content is checked instead.
    <input ref={input} type="file" className="hidden" onChange={async (e) => {
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
 * The line being sung, lit word by word with a soft edge; the word being sung lifts slightly. Reads the audio clock every frame (timeupdate is only ~4 Hz on
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
        if (!el) return;
        const p = wordProgress(w, now);
        el.style.setProperty('--k', `${(-15 + p * 130).toFixed(1)}%`);
        // The word being sung lifts a little and settles back once it is done.
        el.style.transform = `translateY(${(-Math.sin(Math.PI * Math.min(1, p * 1.25)) * 0.06).toFixed(3)}em)`;
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
        <p className="mt-1 max-w-xs text-footnote text-fg-2">Cadence doesn’t download lyrics. Add a .lrc, .ttml or .txt file you own, paste text, or import a song that has lyrics embedded.</p>
        <div className="mt-4 flex gap-2">
          <button className="press h-10 rounded-full bg-fg px-4 text-footnote font-semibold text-black" onClick={picker.open}>Add lyrics file</button>
          <button className="press h-10 rounded-full bg-s2 px-4 text-footnote font-semibold" onClick={() => setPaste(true)}>Paste</button>
        </div>
        {picker.el}
        {paste && <PasteLyricsSheet track={track} onClose={() => setPaste(false)} />}
      </div>
    );
  }
  return lyrics.kind === 'synced'
    ? <SyncedLyrics key={track.id} trackId={track.id} lines={lyrics.lines ?? []} offset={lyrics.offset ?? 0} />
    : <PlainLyrics key={track.id} track={track} text={lyrics.text ?? ''} />;
}

/** Plain text. Deliberately does not read playback time: nothing here can change, fade or move while a song plays. */
function PlainLyrics({ track, text }: { track: Track; text: string }) {
  const [sync, setSync] = useState(false);
  return (
    <>
    <div className={scroller} data-kind="plain" aria-label="Lyrics" style={{ maskImage: FADE, WebkitMaskImage: FADE }}>
      <article className="pb-10 pt-6" data-plain-lyrics>
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-caption uppercase tracking-wider text-fg-3">Lyrics · not time-synced</p>
          <button className="press h-8 shrink-0 rounded-full bg-white/10 px-3 text-footnote font-semibold" onClick={() => setSync(true)} data-sync-start>Sync to song</button>
        </div>
        <div className="space-y-7">
          {stanzas(text).map((st, n) => (
            <div key={n} className="space-y-1.5 text-[1.0625rem] font-medium leading-[1.65] text-fg/90">
              {st.map((line, k) => <p key={k} className="break-words">{line}</p>)}
            </div>
          ))}
        </div>
      </article>
    </div>
    {sync && <SyncLyricsSheet track={track} lines={linesToSync(text)} onClose={() => setSync(false)} />}
    </>
  );
}

/** Depth of field: the sung line is sharp, its neighbours almost, further lines softer; sung lines are dimmer. */
export function lineLook(d: number): { opacity: number; blur: number } {
  if (d === 0) return { opacity: 1, blur: 0 };
  const a = Math.abs(d);
  return { opacity: d < 0 ? 0.3 : a === 1 ? 0.55 : a === 2 ? 0.45 : 0.38, blur: a <= 1 ? 0 : Math.min((a - 1) * 0.8, 2.4) };
}

/** Lines further than this from the sung one are off screen: no blur filter for them, it only costs. */
const BLUR_RANGE = 7;
const STAGGER_MS = 38;

function SyncedLyrics({ trackId, lines, offset }: { trackId: string; lines: LyricLine[]; offset: number }) {
  const { currentTime } = usePlaybackTime();
  // A positive offset shows every line later: compare the lines against an earlier song time.
  const idx = currentLineIndex(lines, currentTime - offset);
  const box = useRef<HTMLDivElement>(null);
  const holdUntil = useRef(0);
  const first = useRef(true);
  const reduce = prefersReducedMotion();

  // The list jumps to its new place at once, then every visible line springs from where it was, each a moment after
  // the one above it, so the lyrics flow up line by line instead of scrolling as one block.
  useEffect(() => {
    const c = box.current;
    if (!c || idx < 0 || Date.now() < holdUntil.current) return;
    const line = c.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    if (!line) return;
    const target = Math.max(0, line.offsetTop - c.clientHeight * 0.38 + line.clientHeight / 2);
    const delta = target - c.scrollTop;
    const animate = !reduce && !first.current && Math.abs(delta) > 1 && Math.abs(delta) < c.clientHeight && typeof line.animate === 'function';
    first.current = false;
    if (!animate) { c.scrollTo({ top: target, behavior: reduce || Math.abs(delta) >= c.clientHeight ? 'auto' : 'smooth' }); return; }
    c.scrollTop = target;
    const view = c.getBoundingClientRect();
    let order = 0;
    c.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < view.top - 120 || r.top > view.bottom + 120) return; // off screen: nothing to see
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: LINE_SPRING.duration, delay: order++ * STAGGER_MS, easing: LINE_SPRING.easing, fill: 'backwards' });
    });
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
          const d = idx < 0 ? i + 1 : i - idx;
          const look = lineLook(d);
          const blur = !reduce && Math.abs(d) <= BLUR_RANGE && look.blur > 0 ? `blur(${look.blur}px)` : undefined;
          return (
            <li key={i} data-line={i}>
              {!gap ? (
                <button
                  className="block w-full origin-left break-words text-left text-title-lg font-semibold leading-snug"
                  style={{
                    opacity: look.opacity, filter: blur,
                    transition: reduce ? 'none' : 'opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out), filter var(--dur-slow) var(--ease-out)',
                    transform: !reduce && !active ? 'scale(.96)' : undefined,
                  }}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => getPlayer().seek(l.t + offset)}
                >{active && !reduce ? <KaraokeLine line={l} nextT={lines[i + 1]?.t} offset={offset} /> : l.text}</button>
              ) : interlude ? (
                <div className="flex h-8 items-center gap-1.5" data-interlude role="img" aria-label="Instrumental" style={{ opacity: active ? 0.9 : 0.18, transition: reduce ? 'none' : 'opacity var(--dur-slow)' }}>
                  {[0, 1, 2].map((k) => <span key={k} className={`h-2 w-2 rounded-full bg-fg ${active && !reduce ? 'animate-pulse' : ''}`} style={{ animationDelay: `${k * 200}ms` }} />)}
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

/**
 * Turns plain lyrics into synced ones on the device: play the song and tap as each line starts. Saved as synced
 * lyrics (the plain text is replaced) and can be saved as an .lrc file too.
 */
export function SyncLyricsSheet({ track, lines, onClose }: { track: Track; lines: string[]; onClose: () => void }) {
  const p = getPlayer();
  const s = usePlayer();
  const { currentTime, duration } = usePlaybackTime();
  const [taps, setTaps] = useState<number[]>([]);
  const list = useRef<HTMLOListElement>(null);
  const next = taps.length;
  const done = next >= lines.length;
  const playingThis = s.track?.id === track.id;

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-sync-line="${Math.min(next, lines.length - 1)}"]`)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [next, lines.length]);

  const start = () => { setTaps([]); p.seek(0); void p.play(); };
  const tap = () => { if (done || !playingThis) return; haptic(); setTaps((t) => [...t, p.audio.currentTime]); };
  const undo = () => {
    if (!taps.length) return;
    const last = taps[taps.length - 1];
    setTaps((t) => t.slice(0, -1));
    p.seek(Math.max(0, last - 3)); // replay a little before the line that was undone
  };
  const save = async (file: boolean) => {
    const synced = linesFromTaps(lines, taps);
    await db.lyrics.put({ trackId: track.id, kind: 'synced', lines: synced, source: 'manual' });
    if (file) {
      const url = URL.createObjectURL(new Blob([toLrcText(synced)], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${track.title}.lrc`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    ui.toast('Synced lyrics saved');
    onClose();
  };

  return (
    <Sheet title="Sync lyrics" tall onClose={onClose}>
      <p className="mb-3 text-footnote text-fg-2">Play the song and tap the big button the moment each line starts. Undo replays a few seconds. It stays on this device.</p>
      <div className="mb-3 flex items-center gap-2">
        <button className="press flex h-10 w-10 items-center justify-center rounded-full bg-s3" aria-label={s.isPlaying && playingThis ? 'Pause' : 'Play'}
          onClick={() => (playingThis ? void p.toggle() : void p.playQueue([track.id], 0))}>{s.isPlaying && playingThis ? <PauseIcon size={18} /> : <PlayIcon size={18} />}</button>
        <span className="min-w-0 flex-1 text-footnote tabular-nums text-fg-2">{playingThis ? `${formatTime(currentTime)} / ${formatTime(duration)}` : 'Not playing this song yet'}</span>
        <button className="press h-10 rounded-full bg-s3 px-4 text-footnote font-semibold" onClick={start}>From the start</button>
      </div>
      <ol ref={list} className="mb-3 max-h-[38dvh] space-y-1 overflow-y-auto rounded-lg bg-s3/60 p-2" data-sync-list>
        {lines.map((l, i) => (
          <li key={i} data-sync-line={i} className={`flex gap-3 rounded-md px-2 py-1.5 text-body ${i === next ? 'bg-white/10 font-semibold text-fg' : i < next ? 'text-fg-2' : 'text-fg-3'}`}>
            <span className="w-12 shrink-0 text-caption tabular-nums leading-6 text-fg-3">{i < next ? `${formatTime(taps[i])}.${Math.floor(taps[i] * 10) % 10}` : ''}</span>
            <span className="min-w-0 break-words">{l}</span>
          </li>
        ))}
      </ol>
      <button className="press mb-2 flex h-16 w-full items-center justify-center rounded-xl bg-fg px-4 text-center font-semibold text-black disabled:opacity-40" disabled={done || !playingThis || !s.isPlaying} onClick={tap} data-sync-tap>
        <span className="line-clamp-2">{done ? 'All lines timed' : `Tap: ${lines[next]}`}</span>
      </button>
      <div className="flex gap-2">
        <button className="press h-11 flex-1 rounded-full bg-s3 font-semibold disabled:opacity-40" disabled={!taps.length} onClick={undo}>Undo</button>
        <button className="press h-11 flex-1 rounded-full bg-s3 font-semibold disabled:opacity-40" disabled={!done} onClick={() => void save(true)}>Save + .lrc</button>
        <button className="press h-11 flex-1 rounded-full bg-fg font-semibold text-black disabled:opacity-40" disabled={!done} onClick={() => void save(false)}>Save</button>
      </div>
    </Sheet>
  );
}
