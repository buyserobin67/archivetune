import { useArt } from '../lib/hooks';
import { NoteIcon } from './Icons';

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 60;
  return 250 + h; // keep placeholders in the violet/indigo/magenta range
}

export function Art({ trackId, seed = '', className = '', rounded = 'rounded-xl' }: { trackId?: string; seed?: string; className?: string; rounded?: string }) {
  const url = useArt(trackId);
  return (
    <div className={`relative aspect-square overflow-hidden bg-ink-700 shrink-0 ${rounded} ${className}`}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover animate-fade" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/55" style={{ background: `linear-gradient(135deg, hsl(${hue(seed)} 55% 22%), hsl(${hue(seed) + 30} 60% 10%))` }}>
          <NoteIcon size={28} />
        </div>
      )}
    </div>
  );
}
