/**
 * A light tap of the haptic engine. Android and other browsers with `navigator.vibrate` use it. iOS Safari has no
 * vibration API, but toggling an `<input type="checkbox" switch>` (Safari 17.4+) fires the system switch haptic, so a
 * hidden one is clicked. Apple may close this at any time: every failure is silent and nothing depends on it.
 * Must be called from a user gesture.
 */
export const HAPTICS_KEY = 'cadence.haptics';

let label: HTMLLabelElement | null = null;

export function hapticsOn(): boolean {
  try { return localStorage.getItem(HAPTICS_KEY) !== 'false'; } catch { return true; }
}

export function haptic(): void {
  if (typeof document === 'undefined' || !hapticsOn()) return;
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
    if (typeof nav.vibrate === 'function' && !/iP(hone|ad|od)/.test(navigator.userAgent)) { nav.vibrate(8); return; }
    if (!label) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'cadence-haptic';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      label = document.createElement('label');
      label.htmlFor = input.id;
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:0';
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  } catch { /* unsupported: no haptics */ }
}
