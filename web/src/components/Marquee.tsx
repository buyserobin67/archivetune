import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/ui';

const GAP = 48; // px between the end of the text and its repeat
const SPEED = 28; // px per second: slow enough to read

/**
 * One line of text that slowly scrolls when it does not fit, pausing at the start of each pass (like the iOS music
 * player). Fits: plain text. Reduce Motion: truncated with an ellipsis instead.
 */
export function Marquee({ text, className = '' }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const b = box.current, p = probe.current;
    if (!b || !p) return;
    const measure = () => { setWidth(p.scrollWidth); setFits(p.scrollWidth <= b.clientWidth + 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text]);
  const moving = !fits && !prefersReducedMotion();
  const dist = width + GAP;
  return (
    <span ref={box} className={`relative block overflow-hidden whitespace-nowrap ${className}`}
      style={moving ? { maskImage: 'linear-gradient(to right, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 90%, transparent)' } : undefined}
      title={text} data-marquee={moving ? 'moving' : 'still'}>
      {/* invisible copy for measuring the full width */}
      <span ref={probe} className="invisible absolute left-0 top-0 whitespace-nowrap" aria-hidden="true">{text}</span>
      {moving ? (
        <span className="marquee inline-flex" style={{ ['--dist' as string]: `${-dist}px`, animationDuration: `${dist / SPEED + 3}s` }}>
          <span>{text}</span>
          <span aria-hidden="true" style={{ paddingLeft: GAP }}>{text}</span>
        </span>
      ) : <span className="block truncate">{text}</span>}
    </span>
  );
}
