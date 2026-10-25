import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUI } from '../lib/ui';
import { HomeIcon, LibraryIcon, SearchIcon } from './Icons';
import { MiniPlayer } from './MiniPlayer';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/library/songs', label: 'Library', Icon: LibraryIcon, prefix: '/library' },
];

/** True while the on-screen keyboard is up, so the dock doesn't float on top of it. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setOpen(window.innerHeight - vv.height > 140);
    check();
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);
  return open;
}

/** Mini-player directly above a compact floating tab bar (Home, Search, Library). */
export function Dock() {
  const ref = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardOpen();
  const { toast } = useUI();
  const { pathname } = useLocation();

  // Publish the dock height so scroll areas can pad themselves exactly.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--dock-h', `${keyboard ? 0 : el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [keyboard]);

  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-30 pt-4 transition-transform duration-slow ease-out"
      style={{ transform: keyboard ? 'translateY(120%)' : undefined, background: 'linear-gradient(to top, var(--bg) 62%, transparent)' }}
    >
      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-4 pb-2" role="status" aria-live="polite">
          <div className="animate-pop max-w-full rounded-full bg-fg px-4 py-2 text-footnote font-medium text-black shadow-float">{toast.text}</div>
        </div>
      )}
      <MiniPlayer />
      <nav aria-label="Primary" className="px-3" style={{ paddingBottom: 'calc(var(--sab) * 0.6 + 0.5rem)' }}>
        <ul className="mx-auto flex max-w-md rounded-[1.375rem] bg-s1 px-1 ring-1 ring-white/[0.06] shadow-float">
          {TABS.map(({ to, label, Icon, end, prefix }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => {
                const on = isActive || (prefix ? pathname.startsWith(prefix) : false);
                return `press flex h-14 flex-col items-center justify-center gap-0.5 text-caption ${on ? 'font-semibold text-fg' : 'font-medium text-fg-2'}`;
              }}>
                <Icon size={22} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
