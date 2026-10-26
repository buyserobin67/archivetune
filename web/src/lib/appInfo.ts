/** Stamped at build time (vite.config.ts). Shown in Settings so you can tell exactly which build is running. */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
export const APP_BUILT_AT = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';
/** Git branch this build came from, when the host told us (Cloudflare Pages). '' otherwise. */
export const APP_BRANCH = typeof __APP_BRANCH__ !== 'undefined' ? __APP_BRANCH__ : '';

export const appLabel = () => `${APP_VERSION} (${APP_BUILD})`;
