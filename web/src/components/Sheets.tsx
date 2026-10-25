import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deleteTrack, toggleFavorite } from '../lib/library';
import { forgetArt } from '../lib/art';
import { getPlayer } from '../lib/player';
import { addToPlaylist, createPlaylist } from '../lib/playlists';
import { usePlaylists } from '../lib/hooks';
import { formatBytes, formatTime } from '../lib/storage';
import { ui, useUI } from '../lib/ui';
import { Art } from './Art';
import { HeartIcon, PlusIcon, QueueIcon, TrashIcon, PlayIcon, NoteIcon } from './Icons';

export function Sheet({ onClose, children, z = 'z-[60]' }: { onClose: () => void; children: ReactNode; z?: string }) {
  return (
    <div className={`fixed inset-0 ${z} flex items-end`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div className="glass relative w-full max-h-[85%] overflow-y-auto rounded-t-3xl border-t border-white/10 px-4 pb-safe pt-3 animate-rise">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        {children}
        <div className="h-4" />
      </div>
    </div>
  );
}

function Item({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`press flex w-full items-center gap-4 rounded-xl px-2 py-3.5 text-left text-[16px] ${danger ? 'text-red-400' : ''}`} onClick={onClick}>
      <span className="w-6 text-white/70">{icon}</span>
      {label}
    </button>
  );
}

export function TrackSheet() {
  const { sheetTrackId } = useUI();
  const track = useLiveQuery(() => (sheetTrackId ? db.tracks.get(sheetTrackId) : undefined), [sheetTrackId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [sheetTrackId]);
  if (!sheetTrackId || !track) return null;
  const p = getPlayer();
  const close = ui.closeTrackSheet;
  return (
    <Sheet onClose={close}>
      <div className="mb-2 flex items-center gap-3 px-1">
        <Art trackId={track.hasArt ? track.id : undefined} seed={track.album} className="h-14 w-14" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{track.title}</div>
          <div className="truncate text-sm text-white/55">{track.artist} · {track.album}</div>
        </div>
      </div>
      <Item icon={<PlayIcon size={20} />} label="Play next" onClick={() => { p.enqueueNext([track.id]); ui.toast('Playing next'); close(); }} />
      <Item icon={<QueueIcon size={20} />} label="Add to queue" onClick={() => { p.enqueue([track.id]); ui.toast('Added to queue'); close(); }} />
      <Item icon={<HeartIcon size={20} filled={!!track.favorite} />} label={track.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => { void toggleFavorite(track.id); close(); }} />
      <Item icon={<PlusIcon size={20} />} label="Add to playlist" onClick={() => { close(); ui.openPlaylistPicker([track.id]); }} />
      {track.license && (
        <div className="mx-2 my-2 rounded-xl bg-white/5 p-3 text-[13px] leading-relaxed text-white/70">
          <div className="font-medium text-white/90">License: {track.license.name}</div>
          <div>Credit: {track.license.attribution}</div>
          {track.license.sourceUrl && <a className="text-violet-300 underline" href={track.license.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a>}
          {track.license.url && <> · <a className="text-violet-300 underline" href={track.license.url} target="_blank" rel="noreferrer noopener">License text</a></>}
        </div>
      )}
      <div className="px-2 py-2 text-xs text-white/40">{track.mime} · {formatBytes(track.size)} · {formatTime(track.duration)} · {track.fileName}</div>
      {confirmDelete ? (
        <Item danger icon={<TrashIcon size={20} />} label="Tap again to delete from this device" onClick={async () => {
          await deleteTrack(track.id); await forgetArt(track.id); await p.onLibraryChanged(); ui.toast('Deleted'); close();
        }} />
      ) : (
        <Item danger icon={<TrashIcon size={20} />} label="Delete from library" onClick={() => setConfirmDelete(true)} />
      )}
    </Sheet>
  );
}

export function PlaylistPicker() {
  const { pickerTrackIds } = useUI();
  const lists = usePlaylists();
  const [name, setName] = useState('');
  if (!pickerTrackIds) return null;
  const close = ui.closePlaylistPicker;
  const add = async (id: string, label: string) => {
    const n = await addToPlaylist(id, pickerTrackIds);
    ui.toast(n ? `Added to ${label}` : `Already in ${label}`);
    close();
  };
  return (
    <Sheet onClose={close} z="z-[70]">
      <h3 className="mb-2 px-1 text-lg font-semibold">Add to playlist</h3>
      <form className="mb-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const p = await createPlaylist(name || 'New Playlist'); setName(''); await add(p.id, p.name); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" className="min-w-0 flex-1 rounded-xl bg-white/10 px-4 py-3 text-[16px] outline-none placeholder:text-white/35 focus:ring-2 focus:ring-violet-500" />
        <button className="press rounded-xl bg-violet-600 px-4 font-medium">Create</button>
      </form>
      {(lists ?? []).map((p) => (
        <Item key={p.id} icon={<NoteIcon size={20} />} label={`${p.name} · ${p.trackIds.length}`} onClick={() => void add(p.id, p.name)} />
      ))}
    </Sheet>
  );
}

export function Toast() {
  const { toast } = useUI();
  if (!toast) return null;
  return (
    <div key={toast.id} className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center px-4 animate-pop" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
      <div className="glass rounded-full border border-white/10 px-4 py-2 text-sm shadow-lg">{toast.text}</div>
    </div>
  );
}
