import { useMemo } from 'react';
import { useArt } from '../lib/hooks';
import { rgbCss, seedPalette } from '../lib/palette';

interface ArtProps {
  trackId?: string;
  /** Used for the generated fallback cover. Same seed, same cover. */
  seed?: string;
  className?: string;
  rounded?: string;
  /** Sets view-transition-name so the cover can morph between mini and full player. */
  vtName?: string;
  shadow?: boolean;
  priority?: boolean;
}

export function Art({ trackId, seed = '', className = '', rounded = 'rounded-lg', vtName, shadow, priority }: ArtProps) {
  const url = useArt(trackId);
  return (
    <div
      className={`relative aspect-square shrink-0 overflow-hidden bg-s2 ${rounded} ${shadow ? 'shadow-card' : ''} ${className}`}
      style={vtName ? ({ viewTransitionName: vtName } as React.CSSProperties) : undefined}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full animate-fade object-cover" draggable={false} decoding="async" loading={priority ? 'eager' : 'lazy'} />
      ) : (
        <FallbackCover seed={seed} />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.07]" />
    </div>
  );
}

/** Generated cover for tracks without artwork: seeded gradient, soft orbs, a quiet waveform glyph. */
export function FallbackCover({ seed }: { seed: string }) {
  const p = useMemo(() => seedPalette(seed || 'cadence'), [seed]);
  const a = rgbCss(p.accent), b = rgbCss(p.accent2), t = rgbCss(p.tint);
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(90% 90% at 18% 12%, rgb(${a} / .75), transparent 60%), radial-gradient(80% 80% at 88% 92%, rgb(${b} / .85), transparent 62%), linear-gradient(160deg, rgb(${t}), #0a0a10)`,
      }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g fill="rgb(255 255 255 / .82)">
          {[22, 40, 58, 36, 50, 28].map((h, i) => (
            <rect key={i} x={23 + i * 9} y={50 - h / 2} width="4.6" height={h} rx="2.3" opacity={0.55 + (i % 3) * 0.18} />
          ))}
        </g>
      </svg>
    </div>
  );
}
