/** Whether Home shows "your evening music" and the like. The log itself is the recap's; this only hides suggestions. */
export const PATTERNS_KEY = 'cadence.patterns';
export function patternsOn(): boolean {
  try { return localStorage.getItem(PATTERNS_KEY) !== 'false'; } catch { return true; }
}
