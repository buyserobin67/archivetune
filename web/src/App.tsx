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

/** Opt-in: some Home Screen apps get a layout viewport shorter than the screen. This stretches the app to the screen height. */
function useFullHeight(): React.CSSProperties | undefined {
  const [on] = usePref<boolean>('fullHeight', false);
  const [h, setH] = useState(() => Math.max(window.innerHeight, screen.height));
  useEffect(() => {
    const u = () => setH(Math.max(window.innerHeight, screen.height));
    window.addEventListener('resize', u);
    window.addEventListener('orientationchange', u);
    return () => { window.removeEventListener('resize', u); window.removeEventListener('orientationchange', u); };
  }, []);
  return on && isStandalone() ? { bottom: 'auto', height: h } : undefined;
}

export default function App() {
  const full = useFullHeight();
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname.split('/').slice(0, 3).join('/')]);

  return (
    <div id="app-root" className="fixed inset-0 overflow-hidden bg-bg" style={full}>
      <main ref={main} id="main" className="scroll-y hide-scroll absolute inset-0" style={{ paddingBottom: 'calc(var(--dock-h) + 1.5rem)' }}>
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
