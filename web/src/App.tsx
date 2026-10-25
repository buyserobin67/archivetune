import { useEffect, useRef } from 'react';
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

export default function App() {
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname.split('/').slice(0, 3).join('/')]);

  return (
    <div id="app-root" className="fixed inset-0 overflow-hidden bg-bg">
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
