/**
 * Home Screen apps on some iPhones get a layout viewport that is shorter than the screen, which leaves an empty
 * band under the tab bar. This decides when to stretch the app to the real screen height.
 */
export interface ViewportFacts {
  standalone: boolean;
  innerWidth: number;
  innerHeight: number;
  /** visualViewport height when available (shrinks while the keyboard is open). */
  visualHeight?: number;
  screenWidth: number;
  screenHeight: number;
  /** A text field has focus, so the viewport is short because of the keyboard, not the bug. */
  typing: boolean;
}

/** A gap smaller than this is just browser chrome rounding; larger than MAX is not this bug (split view, desktop window). */
export const MIN_GAP = 24;
export const MAX_GAP = 140;
/** iPhones with a home indicator report at least 812pt of screen height and reserve 34pt at the bottom. */
export const HOME_INDICATOR = 34;

/** Real screen height for the current orientation (iOS reports portrait numbers regardless of rotation). */
export function screenHeightNow(f: Pick<ViewportFacts, 'innerWidth' | 'innerHeight' | 'screenWidth' | 'screenHeight'>): number {
  const long = Math.max(f.screenWidth, f.screenHeight), short = Math.min(f.screenWidth, f.screenHeight);
  return f.innerHeight >= f.innerWidth ? long : short;
}

/** Height to stretch the app to, or null to leave the layout exactly as the browser gave it. */
export function fillHeight(f: ViewportFacts): number | null {
  if (!f.standalone || f.typing) return null;
  const seen = Math.max(f.innerHeight, f.visualHeight ?? 0);
  const gap = screenHeightNow(f) - seen;
  return gap > MIN_GAP && gap <= MAX_GAP ? screenHeightNow(f) : null;
}

/** Bottom safe-area to use when filling: the measured inset, but never less than the home indicator on iPhones that have one. */
export function bottomInsetWhenFilled(measured: number, screenH: number): number {
  return screenH >= 812 ? Math.max(measured, HOME_INDICATOR) : measured;
}
