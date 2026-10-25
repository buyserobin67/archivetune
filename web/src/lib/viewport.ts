/**
 * Real screen height for the current orientation (iOS reports portrait numbers regardless of rotation).
 * Used by Settings → Display to show how much shorter the Home Screen app's window is than the screen.
 *
 * Note: stretching the page past the window does NOT work. iOS never draws below the web view, so anything placed
 * there (including the tab bar) is simply cut off. The window size itself is chosen by iOS from the launch images.
 */
export function screenHeightNow(f: { innerWidth: number; innerHeight: number; screenWidth: number; screenHeight: number }): number {
  const long = Math.max(f.screenWidth, f.screenHeight), short = Math.min(f.screenWidth, f.screenHeight);
  return f.innerHeight >= f.innerWidth ? long : short;
}
