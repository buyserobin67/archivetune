/**
 * Browsers keep website data (IndexedDB, caches) per origin, and Safari and an installed Home Screen app keep
 * separate copies even for the same address. Songs imported in one place are not visible in another.
 */
export type OriginKind = 'production' | 'preview' | 'snapshot' | 'local' | 'custom';

export interface OriginInfo {
  kind: OriginKind;
  host: string;
  note: string;
  /** Where newer versions are published, for addresses that never update themselves. */
  liveUrls?: { label: string; url: string }[];
}

/** Cloudflare's alias for a branch: lower case, anything else becomes "-", at most 28 characters. */
export function branchAlias(branch: string): string {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28).replace(/^-+|-+$/g, '');
}

export function classifyOrigin(hostname: string, branch = ''): OriginInfo {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) {
    return { kind: 'local', host, note: 'Local development server.' };
  }
  if (host.endsWith('.pages.dev')) {
    const parts = host.split('.');
    // project.pages.dev is the production address; anything.project.pages.dev is a preview of one branch or commit.
    if (parts.length <= 3) return { kind: 'production', host, note: 'Your main Cadence address.' };
    const project = parts.slice(-3).join('.');
    // <8 hex>.project.pages.dev is one single deploy, kept as it was. It never receives a newer version.
    if (parts.length === 4 && /^[0-9a-f]{8}$/.test(parts[0])) {
      const liveUrls = [
        ...(branch ? [{ label: `Latest of ${branch}`, url: `https://${branchAlias(branch)}.${project}/` }] : []),
        { label: 'Main address', url: `https://${project}/` },
      ];
      return {
        kind: 'snapshot', host, liveUrls,
        note: 'This address is one fixed deploy. It never changes, so Check for updates can never find a newer version here. New versions go to the addresses below. Each address has its own library: make a backup here (Backup & restore), then restore it there.',
      };
    }
    return { kind: 'preview', host, note: 'A preview address. It has its own separate library, different from your main address.' };
  }
  return { kind: 'custom', host, note: 'Your library is stored for this exact address.' };
}
