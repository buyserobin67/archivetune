/**
 * Browsers keep website data (IndexedDB, caches) per origin, and Safari and an installed Home Screen app keep
 * separate copies even for the same address. Songs imported in one place are not visible in another.
 */
export type OriginKind = 'production' | 'preview' | 'local' | 'custom';

export interface OriginInfo { kind: OriginKind; host: string; note: string }

export function classifyOrigin(hostname: string): OriginInfo {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) {
    return { kind: 'local', host, note: 'Local development server.' };
  }
  if (host.endsWith('.pages.dev')) {
    // project.pages.dev is the production address; anything.project.pages.dev is a preview of one branch or commit.
    return host.split('.').length <= 3
      ? { kind: 'production', host, note: 'Your main Cadence address.' }
      : { kind: 'preview', host, note: 'A preview address. It has its own separate library, different from your main address.' };
  }
  return { kind: 'custom', host, note: 'Your library is stored for this exact address.' };
}
