import { NavLink, Route, Routes } from 'react-router-dom';
import { HomeIcon, LibraryIcon, SearchIcon, SettingsIcon } from './components/Icons';
import { MiniPlayer } from './components/MiniPlayer';
import { NowPlaying } from './components/NowPlaying';
import { PlaylistPicker, Toast, TrackSheet } from './components/Sheets';
import Home from './screens/Home';
import Library, { GroupDetail, PlaylistDetail } from './screens/Library';
import Search from './screens/Search';
import Settings from './screens/Settings';

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/library/songs', label: 'Library', Icon: LibraryIcon, match: '/library' },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function App() {
  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <main className="scroll-y hide-scroll relative flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/albums/:key" element={<GroupDetail kind="albums" />} />
          <Route path="/library/artists/:key" element={<GroupDetail kind="artists" />} />
          <Route path="/library/playlists/:id" element={<PlaylistDetail />} />
          <Route path="/library/:tab" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <div className="h-6" />
      </main>
      <div className="z-30">
        <MiniPlayer />
        <nav className="glass border-t border-white/10 pb-safe">
          <ul className="flex">
            {TABS.map(({ to, label, Icon, end, match }) => (
              <li key={to} className="flex-1">
                <NavLink to={to} end={end} className={({ isActive }) => `press flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive || (match && location.hash.startsWith('#' + match)) ? 'text-violet-300' : 'text-white/45'}`}>
                  <Icon size={24} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <NowPlaying />
      <TrackSheet />
      <PlaylistPicker />
      <Toast />
    </div>
  );
}
