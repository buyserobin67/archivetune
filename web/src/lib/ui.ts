import { useSyncExternalStore } from 'react';

interface UIState {
  playerOpen: boolean;
  playerTab: 'now' | 'queue';
  toast: { id: number; text: string } | null;
  sheetTrackId: string | null;
  pickerTrackIds: string[] | null;
}

let state: UIState = { playerOpen: false, playerTab: 'now', toast: null, sheetTrackId: null, pickerTrackIds: null };
const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

function set(p: Partial<UIState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export const ui = {
  openPlayer: (tab: UIState['playerTab'] = 'now') => set({ playerOpen: true, playerTab: tab }),
  closePlayer: () => set({ playerOpen: false }),
  setPlayerTab: (tab: UIState['playerTab']) => set({ playerTab: tab }),
  openTrackSheet: (id: string) => set({ sheetTrackId: id }),
  closeTrackSheet: () => set({ sheetTrackId: null }),
  openPlaylistPicker: (ids: string[]) => set({ pickerTrackIds: ids }),
  closePlaylistPicker: () => set({ pickerTrackIds: null }),
  toast(text: string) {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastId, text } });
    toastTimer = setTimeout(() => set({ toast: null }), 2800);
  },
};

export function useUI(): UIState {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => state,
  );
}
