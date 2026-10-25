import { useRef } from 'react';
import { haptic } from './haptics';

export const LONG_PRESS_MS = 450;

/** Swallows the one click the browser may send when the finger lifts after a long-press, wherever it lands. */
function swallowNextClick() {
  const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 450);
}

/**
 * Props for an element that opens a menu on long-press (touch) or right-click (mouse). The tap that ends a long-press
 * is swallowed so it neither plays the song nor hits the menu that just opened. Pair with the `hold` class to stop the
 * iOS callout.
 */
export function useLongPress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const press = useRef({ x: 0, y: 0, id: -1 });
  const fired = useRef(false);
  const clear = () => { clearTimeout(timer.current); press.current.id = -1; };
  const fire = () => { fired.current = true; haptic(); onLong(); };
  // Only the pointer that started the press may cancel it (a stale mouse pointer can send pointerleave meanwhile).
  const mine = (e: React.PointerEvent) => e.pointerId === press.current.id;
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      clear();
      if (e.pointerType === 'mouse') return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      timer.current = setTimeout(fire, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (mine(e) && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) clear();
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!mine(e)) return;
      clear();
      if (fired.current) swallowNextClick();
    },
    onPointerCancel: (e: React.PointerEvent) => { if (mine(e)) clear(); },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!fired.current) { clear(); fire(); }
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; }
    },
  };
}
