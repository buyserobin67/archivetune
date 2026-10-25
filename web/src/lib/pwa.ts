export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches);
}

/** Registers the service worker with the correct scope for the GitHub Pages subpath. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e) => console.warn('Service worker registration failed', e));
  });
}
