// Home Screen app with a viewport shorter than the screen: the app must stretch to the screen and keep the home indicator clear.
// Safari tabs and correct viewports must not change. Chromium emulation of the iOS numbers (the real device is not available here).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const BASE = process.env.E2E_BASE ?? '/archivetune/';
const PORT = Number(process.env.E2E_PORT ?? 4175);
const URL = `http://localhost:${PORT}${BASE}`;
let failures = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}${ok ? '' : ' ' + extra}`); if (!ok) failures++; };

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { env: { ...process.env, VITE_BASE: BASE }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** viewport height < screen height by `gap`, standalone or not, bottom safe area as the browser reports it */
async function scenario(name, { standalone, gap, insetBottom }) {
  const screenH = 874, w = 402;
  const ctx = await browser.newContext({ viewport: { width: w, height: screenH - gap }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([sh, sw, st]) => {
    Object.defineProperty(screen, 'height', { value: sh }); Object.defineProperty(screen, 'width', { value: sw });
    if (st) Object.defineProperty(navigator, 'standalone', { value: true });
  }, [screenH, w, standalone]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: insetBottom, left: 0, right: 0 } }).catch(() => {});
  await page.goto(URL);
  await page.waitForSelector('nav[aria-label="Primary"]');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const root = document.getElementById('app-root').getBoundingClientRect();
    const ul = document.querySelector('nav[aria-label="Primary"] ul').getBoundingClientRect();
    const main = document.getElementById('main');
    return { rootH: Math.round(root.height), ulBottom: Math.round(ul.bottom), inner: innerHeight, fill: document.documentElement.getAttribute('data-fill'), sab: getComputedStyle(document.documentElement).getPropertyValue('--sab').trim(), mainPad: parseFloat(getComputedStyle(main).paddingBottom), dockH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) };
  });
  console.log(`\n== ${name}: ${JSON.stringify(m)}`);
  await ctx.close();
  return m;
}

const bug = await scenario('Home Screen app, viewport 62pt short, inset reported 0', { standalone: true, gap: 62, insetBottom: 0 });
check(bug.fill === '874' && bug.rootH === 874, 'app stretches to the full screen height');
// 28 = the normal floating-dock offset (0.6 x 34pt inset + 8): the same distance a correct viewport gets
check(874 - bug.ulBottom === 28, `tab bar sits exactly where a correct viewport puts it, above the home indicator (${874 - bug.ulBottom}px from the screen bottom)`);
check(bug.mainPad <= bug.dockH + 8 + 1, `scroll padding is trimmed to the dock plus 0.5rem (${bug.mainPad} vs dock ${bug.dockH})`);

const bug2 = await scenario('Home Screen app, viewport 62pt short, inset reported 34', { standalone: true, gap: 62, insetBottom: 34 });
check(bug2.rootH === 874 && 874 - bug2.ulBottom === 28, 'with a correct inset the dock is in the same place (inset not double-counted)', JSON.stringify(bug2));

const ok = await scenario('Home Screen app, correct full viewport', { standalone: true, gap: 0, insetBottom: 34 });
check(ok.fill === null && ok.rootH === ok.inner, 'nothing changes when the viewport already matches the screen');

const safari = await scenario('Safari tab, shorter viewport (browser chrome)', { standalone: false, gap: 100, insetBottom: 34 });
check(safari.fill === null && safari.rootH === safari.inner, 'Safari layout is untouched');

await browser.close();
srv.kill();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll fill-screen checks passed');
process.exit(failures ? 1 : 0);
