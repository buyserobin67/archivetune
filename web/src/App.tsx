import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Dock } from './components/Dock';
import { UpdateBanner } from './components/UpdateBanner';
import { NowPlaying } from './components/NowPlaying';
import { PlaylistPicker, TrackSheet } from './components/Sheets';
import Home from './screens/Home';
import Library from './screens/Library';
import { GroupDetail, PlaylistDetail } from './screens/Detail';
import Search from './screens/Search';
import Settings from './screens/Settings';
import Recap from './screens/Recap';
import { usePref } from './lib/hooks';
import { isStandalone } from './lib/pwa';
import { bottomInsetWhenFilled, fillHeight } from './lib/viewport';

/**
 * Home Screen apps sometimes get a layout viewport shorter than the screen (an empty band under the tab bar).
 * When that happens the app stretches itself to the real screen height and keeps the home-indicator inset.
 * Safari tabs and normal Home Screen launches are never touched. Settings → Display can turn it off.
 */
function useFillScreen(): React.CSSProperties | undefined {
  const [mode] = usePref<string>('fillMode', 'auto');
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
      const next = mode === 'off' ? null : fillHeight({
        standalone: isStandalone(), innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        visualHeight: window.visualViewport?.height, screenWidth: screen.width, screenHeight: screen.height, typing,
      });
      setH(next);
    };
    measure();
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('pageshow', measure);
    document.addEventListener('visibilitychange', measure);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    vv?.addEventListener('resize', measure);
    // iOS can settle the viewport a moment after launch.
    const t = [250, 1000, 2500].map((ms) => setTimeout(measure, ms));
    return () => {
      window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); window.removeEventListener('pageshow', measure);
      document.removeEventListener('visibilitychange', measure); document.removeEventListener('focusin', measure); document.removeEventListener('focusout', measure);
      vv?.removeEventListener('resize', measure); t.forEach(clearTimeout);
    };
  }, [mode]);
  useEffect(() => {
    const root = document.documentElement;
    if (h === null) { root.removeAttribute('data-fill'); root.style.removeProperty('--sab-fill'); return; }
    root.setAttribute('data-fill', String(h));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    const measured = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    root.style.setProperty('--sab-fill', `${bottomInsetWhenFilled(measured, screen.height)}px`);
  }, [h]);
  return h === null ? undefined : { bottom: 'auto', height: h };
}

export default function App() {
  const full = useFillScreen();
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname.split('/').slice(0, 3).join('/')]);

  return (
    <div id="app-root" className="fixed inset-0 overflow-hidden bg-bg" style={full}>
      <main ref={main} id="main" className="scroll-y hide-scroll absolute inset-0" style={{ paddingBottom: 'calc(var(--dock-h) + 0.5rem)' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/albums/:key" element={<GroupDetail kind="albums" />} />
          <Route path="/library/artists/:key" element={<GroupDetail kind="artists" />} />
          <Route path="/library/playlists/:id" element={<PlaylistDetail />} />
          <Route path="/library/:tab" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/recap" element={<Recap />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <UpdateBanner />
      <Dock />
      <NowPlaying />
      <TrackSheet />
      <PlaylistPicker />
    </div>
  );
}
