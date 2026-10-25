import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deleteTrack, groupAlbums, groupArtists, toggleFavorite } from '../lib/library';
import { forgetArt } from '../lib/art';
import { getPlayer } from '../lib/player';
import { addToPlaylist, createPlaylist } from '../lib/playlists';
import { usePlaylists, useTracks } from '../lib/hooks';
import { formatBytes, formatTime } from '../lib/storage';
import { ui, useUI } from '../lib/ui';
import { browserArtProcessor, trimTrack, useOriginal } from '../lib/artEdits';
import { Art } from './Art';
import { AlbumIcon, ArtistIcon, CheckIcon, HeartIcon, NoteIcon, PlayIcon, PlusIcon, QueueIcon, ShuffleIcon, TrashIcon } from './Icons';

const albumKey = (t: { album: string; artist: string }) => `${t.album}\u0000${t.artist}`;

export function Sheet({ onClose, children, z = 'z-[60]', title, tall }: { onClose: () => void; children: ReactNode; z?: string; title?: string; tall?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 ${z} flex items-end`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-black/65" onClick={onClose} />
      <div
        className={`relative flex w-full animate-rise flex-col rounded-t-sheet border-t border-line-strong bg-s2 shadow-float ${tall ? 'h-[92dvh]' : 'max-h-[88dvh]'}`}
        style={{ borderTopColor: 'rgb(255 255 255 / 0.1)' }}
      >
        <div className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-white/25" />
        {title && <h2 className="px-gutter pb-2 pt-2 text-title font-bold">{title}</h2>}
        <div className="scroll-y hide-scroll min-h-0 flex-1 px-gutter pb-[calc(var(--sab)+1rem)]">{children}</div>
      </div>
    </div>
  );
}

export function SheetItem({ icon, label, onClick, danger, detail, selected }: { icon?: ReactNode; label: string; onClick: () => void; danger?: boolean; detail?: string; selected?: boolean }) {
  return (
    <button className={`press flex min-h-[3.25rem] w-full items-center gap-4 rounded-md px-1 text-left text-body-lg ${danger ? 'text-red-400' : ''}`} onClick={onClick}>
      {icon && <span className={`flex w-6 justify-center ${danger ? '' : 'text-fg-2'}`}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="text-footnote text-fg-3">{detail}</span>}
      {selected && <CheckIcon size={20} className="text-accent-text" />}
    </button>
  );
}

export function TrackSheet() {
  const { sheetTrackId } = useUI();
  const track = useLiveQuery(() => (sheetTrackId ? db.tracks.get(sheetTrackId) : undefined), [sheetTrackId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [sheetTrackId]);
  const artEdit = useLiveQuery(() => (sheetTrackId ? db.artEdits.get(sheetTrackId) : undefined), [sheetTrackId]);
  const nav = useNavigate();
  if (!sheetTrackId || !track) return null;
  const p = getPlayer();
  const close = ui.closeTrackSheet;
  const go = (to: string) => { close(); ui.closePlayer(false); nav(to); };
  return (
    <Sheet onClose={close} title={undefined}>
      <div className="mb-2 flex items-center gap-3 border-b border-line pb-3 pt-1">
        <Art trackId={track.hasArt ? track.id : undefined} seed={`${track.album}|${track.artist}`} className="h-14 w-14" rounded="rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-body-lg font-semibold">{track.title}</div>
          <div className="truncate text-footnote text-fg-2">{track.artist} · {track.album}</div>
        </div>
      </div>
      <SheetItem icon={<PlayIcon size={20} />} label="Play next" onClick={() => { p.enqueueNext([track.id]); ui.toast('Playing next'); close(); }} />
      <SheetItem icon={<QueueIcon size={20} />} label="Add to queue" onClick={() => { p.enqueue([track.id]); ui.toast('Added to queue'); close(); }} />
      <SheetItem icon={<HeartIcon size={20} filled={!!track.favorite} />} label={track.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => { void toggleFavorite(track.id); close(); }} />
      <SheetItem icon={<PlusIcon size={20} />} label="Add to playlist" onClick={() => { close(); ui.openPlaylistPicker([track.id]); }} />
      {track.album !== 'Unknown Album' && <SheetItem icon={<AlbumIcon size={20} />} label="Go to album" onClick={() => go(`/library/albums/${encodeURIComponent(albumKey(track))}`)} />}
      {track.artist !== 'Unknown Artist' && <SheetItem icon={<ArtistIcon size={20} />} label="Go to artist" onClick={() => go(`/library/artists/${encodeURIComponent(track.artist)}`)} />}
      {track.hasArt && browserArtProcessor && (artEdit?.blob && !artEdit.disabled ? (
        <SheetItem icon={<NoteIcon size={20} />} label="Use original artwork" onClick={async () => { await useOriginal(track.id); ui.toast('Using the original artwork'); close(); }} />
      ) : (
        <SheetItem icon={<NoteIcon size={20} />} label="Trim artwork borders" onClick={async () => { const r = await trimTrack(track.id, browserArtProcessor!, { flat: true }); ui.toast(r === 'trimmed' ? 'Artwork trimmed (original kept)' : r === 'clean' ? 'No borders found' : 'Could not trim'); close(); }} />
      ))}
      {track.license && (
        <div className="my-2 rounded-lg bg-s3 p-3 text-footnote leading-relaxed text-fg-2">
          <div className="font-semibold text-fg">License: {track.license.name}</div>
          <div>Credit: {track.license.attribution}</div>
          {track.license.sourceUrl && <a className="text-accent-text underline" href={track.license.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a>}
          {track.license.url && <> · <a className="text-accent-text underline" href={track.license.url} target="_blank" rel="noreferrer noopener">License text</a></>}
        </div>
      )}
      <div className="px-1 py-2 text-caption text-fg-3">{track.mime} · {formatBytes(track.size)} · {formatTime(track.duration)} · {track.fileName}</div>
      {confirmDelete ? (
        <SheetItem danger icon={<TrashIcon size={20} />} label="Tap again to delete from this device" onClick={async () => {
          await deleteTrack(track.id); await forgetArt(track.id); await p.onLibraryChanged(); ui.toast('Deleted'); close();
        }} />
      ) : (
        <SheetItem danger icon={<TrashIcon size={20} />} label="Delete from library" onClick={() => setConfirmDelete(true)} />
      )}
    </Sheet>
  );
}

/** Long-press menu for an album or artist card. */
export function GroupSheet() {
  const { sheetGroup } = useUI();
  const tracks = useTracks();
  const nav = useNavigate();
  const group = useMemo(() => {
    if (!sheetGroup || !tracks) return null;
    return (sheetGroup.kind === 'albums' ? groupAlbums(tracks) : groupArtists(tracks)).find((g) => g.key === sheetGroup.key) ?? null;
  }, [sheetGroup, tracks]);
  if (!sheetGroup || !group) return null;
  const p = getPlayer();
  const close = ui.closeGroupSheet;
  const ids = group.trackIds;
  const album = sheetGroup.kind === 'albums';
  return (
    <Sheet onClose={close}>
      <div className="mb-2 flex items-center gap-3 border-b border-line pb-3 pt-1">
        <Art trackId={group.artTrackId} seed={group.name} className="h-14 w-14" rounded={album ? 'rounded-md' : 'rounded-full'} />
        <div className="min-w-0">
          <div className="truncate text-body-lg font-semibold">{group.name}</div>
          <div className="truncate text-footnote text-fg-2">{album ? `${group.subtitle} · ${ids.length} song${ids.length === 1 ? '' : 's'}` : group.subtitle}</div>
        </div>
      </div>
      <SheetItem icon={<PlayIcon size={20} />} label="Play" onClick={() => { void p.playQueue(ids, 0); close(); }} />
      <SheetItem icon={<ShuffleIcon size={20} />} label="Shuffle" onClick={() => { p.setShuffle(true); void p.playQueue(ids, Math.floor(Math.random() * ids.length)); close(); }} />
      <SheetItem icon={<PlayIcon size={20} />} label="Play next" onClick={() => { p.enqueueNext(ids); ui.toast('Playing next'); close(); }} />
      <SheetItem icon={<QueueIcon size={20} />} label="Add to queue" onClick={() => { p.enqueue(ids); ui.toast(`Added ${ids.length} song${ids.length === 1 ? '' : 's'} to queue`); close(); }} />
      <SheetItem icon={<PlusIcon size={20} />} label="Add to playlist" onClick={() => { close(); ui.openPlaylistPicker(ids); }} />
      {album && group.subtitle !== 'Unknown Artist' && <SheetItem icon={<ArtistIcon size={20} />} label="Go to artist" onClick={() => { close(); nav(`/library/artists/${encodeURIComponent(group.subtitle)}`); }} />}
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
    <Sheet onClose={close} z="z-[70]" title="Add to playlist">
      <form className="mb-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const p = await createPlaylist(name || 'New Playlist'); setName(''); await add(p.id, p.name); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist" className="min-w-0 flex-1 rounded-full bg-s3 px-4 py-3 outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent" />
        <button className="press rounded-full bg-accent px-5 font-semibold text-black">Create</button>
      </form>
      {(lists ?? []).map((p) => (
        <SheetItem key={p.id} icon={<NoteIcon size={20} />} label={p.name} detail={`${p.trackIds.length}`} onClick={() => void add(p.id, p.name)} />
      ))}
    </Sheet>
  );
}

export function OptionSheet<T extends string>({ title, options, value, onPick, onClose }: { title: string; options: [T, string][]; value: T; onPick: (v: T) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title={title}>
      {options.map(([k, label]) => <SheetItem key={k} label={label} selected={k === value} onClick={() => { onPick(k); onClose(); }} />)}
    </Sheet>
  );
}
