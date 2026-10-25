import { useEffect, useState } from 'react';
import { usePref } from '../lib/hooks';
import { isStandalone } from '../lib/pwa';
import { ui } from '../lib/ui';

const btn = 'press h-10 rounded-full bg-s3 px-4 text-footnote font-semibold disabled:opacity-40';

export interface DisplayInfo {
  inner: string; visual: string; screen: string; dpr: number; standalone: boolean;
  insets: { top: number; bottom: number; left: number; right: number };
  root: string; gap: number;
}

/** Reads the real viewport numbers. `env()` insets are measured through a probe element. */
export function readDisplay(): DisplayInfo {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
  probe.remove();
  const vv = window.visualViewport;
  const root = document.getElementById('app-root')?.getBoundingClientRect();
  return {
    inner: `${innerWidth}x${innerHeight}`,
    visual: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}` : 'n/a',
    screen: `${screen.width}x${screen.height}`,
    dpr: devicePixelRatio,
    standalone: isStandalone(),
    insets,
    root: root ? `${Math.round(root.width)}x${Math.round(root.height)} at y=${Math.round(root.top)}` : 'n/a',
    gap: screen.height - innerHeight,
  };
}

/** Settings card: shows the viewport the page really got, with an opt-in fix for a short viewport in the Home Screen app. */
export function DisplayDiagnostics() {
  const [info, setInfo] = useState<DisplayInfo | null>(null);
  const [full, setFull] = usePref<boolean>('fullHeight', false);
  useEffect(() => {
    const u = () => setInfo(readDisplay());
    u();
    window.addEventListener('resize', u);
    return () => window.removeEventListener('resize', u);
  }, [full]);
  if (!info) return null;
  const short = info.standalone && info.gap > 20;
  const report = JSON.stringify(info, null, 2);
  return (
    <section className="mb-6 px-gutter" aria-labelledby="display-title">
      <h2 id="display-title" className="eyebrow mb-2 pl-1">Display</h2>
      <div className="overflow-hidden rounded-lg bg-s1 p-4 ring-1 ring-line">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption text-fg-2">
          <dt>Page viewport</dt><dd className="text-right text-fg">{info.inner}</dd>
          <dt>Screen</dt><dd className="text-right text-fg">{info.screen} @{info.dpr}x</dd>
          <dt>App layout box</dt><dd className="text-right text-fg">{info.root}</dd>
          <dt>Safe area (top / bottom)</dt><dd className="text-right text-fg">{info.insets.top} / {info.insets.bottom}</dd>
          <dt>Home Screen app</dt><dd className="text-right text-fg">{info.standalone ? 'yes' : 'no (Safari tab)'}</dd>
        </dl>
        {short && (
          <p className="mt-3 rounded-md bg-white/5 p-3 text-footnote text-fg-2" role="status">
            The page is {info.gap}px shorter than your screen, which can leave empty space under the tab bar. Try “Fill full screen height”.
          </p>
        )}
        <label className="mt-3 flex items-center gap-3 text-footnote text-fg-2">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={full} onChange={(e) => setFull(e.target.checked)} />
          Fill full screen height (Home Screen app only)
        </label>
        <button className={`${btn} mt-3`} onClick={async () => { try { await navigator.clipboard.writeText(report); ui.toast('Display info copied'); } catch { ui.toast('Could not copy'); } }}>Copy display info</button>
      </div>
    </section>
  );
}
