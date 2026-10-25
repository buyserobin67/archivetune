import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

interface UIState {
  playerOpen: boolean;
  playerTab: 'now' | 'queue' | 'lyrics';
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

type VTDoc = Document & { startViewTransition?: (cb: () => void) => unknown };

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const supportsViewTransitions = () => typeof document !== 'undefined' && typeof (document as VTDoc).startViewTransition === 'function' && !prefersReducedMotion();

/** Runs a state change inside a View Transition (cover morph + sheet slide) when the browser has them. */
function transition(update: () => void, animated = true) {
  if (animated && supportsViewTransitions()) {
    (document as VTDoc).startViewTransition!(() => flushSync(update));
  } else {
    update();
  }
}

export const ui = {
  openPlayer: (tab: UIState['playerTab'] = 'now') => transition(() => set({ playerOpen: true, playerTab: tab })),
  /** `animated: false` is for swipe-dismiss, where the sheet has already animated away. */
  closePlayer: (animated = true) => transition(() => set({ playerOpen: false }), animated),
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
