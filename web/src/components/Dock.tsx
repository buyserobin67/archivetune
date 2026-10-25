import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUI } from '../lib/ui';
import { HomeIcon, LibraryIcon, SearchIcon, SettingsIcon } from './Icons';
import { MiniPlayer } from './MiniPlayer';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/library/songs', label: 'Library', Icon: LibraryIcon, prefix: '/library' },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
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
      className="absolute inset-x-0 bottom-0 z-30 transition-transform duration-slow ease-out"
      style={{ transform: keyboard ? 'translateY(110%)' : undefined, background: 'linear-gradient(to top, var(--bg) 55%, transparent)' }}
    >
      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-4 pb-2" role="status" aria-live="polite">
          <div className="animate-pop max-w-full rounded-full bg-fg px-4 py-2 text-footnote font-medium text-black shadow-float">{toast.text}</div>
        </div>
      )}
      <MiniPlayer />
      <nav aria-label="Primary" className="border-t border-line bg-bg pb-[var(--sab)]">
        <ul className="mx-auto flex max-w-xl">
          {TABS.map(({ to, label, Icon, end, prefix }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => {
                const on = isActive || (prefix ? pathname.startsWith(prefix) : false);
                return `press relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-caption font-medium ${on ? 'text-accent-text' : 'text-fg-3'}`;
              }}>
                <Icon size={24} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
