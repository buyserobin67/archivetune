export interface StorageStatus {
  supported: boolean;
  usage: number;
  quota: number;
  /** quota - usage */
  free: number;
  ratio: number;
  persisted: boolean | null;
  level: 'ok' | 'warn' | 'critical';
}

export const WARN_RATIO = 0.8;
export const CRITICAL_RATIO = 0.95;
export const LOW_FREE_BYTES = 200 * 1024 * 1024;

export function classify(usage: number, quota: number): StorageStatus['level'] {
  if (!quota) return 'ok';
  const ratio = usage / quota;
  const free = quota - usage;
  if (ratio >= CRITICAL_RATIO || free < LOW_FREE_BYTES / 4) return 'critical';
  if (ratio >= WARN_RATIO || free < LOW_FREE_BYTES) return 'warn';
  return 'ok';
}

type StorageLike = Pick<StorageManager, 'estimate' | 'persist' | 'persisted'>;

const nav = (): { storage?: StorageLike } => (typeof navigator === 'undefined' ? {} : (navigator as unknown as { storage?: StorageLike }));

/** Asks the browser not to evict our data. iOS may ignore or deny this; callers must not assume it sticks. */
export async function requestPersistence(storage: StorageLike | undefined = nav().storage): Promise<boolean | null> {
  try {
    if (!storage?.persist) return null;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}

export async function getStorageStatus(storage: StorageLike | undefined = nav().storage): Promise<StorageStatus> {
  if (!storage?.estimate) return { supported: false, usage: 0, quota: 0, free: 0, ratio: 0, persisted: null, level: 'ok' };
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    let persisted: boolean | null = null;
    try { persisted = storage.persisted ? await storage.persisted() : null; } catch { /* ignore */ }
    return { supported: true, usage, quota, free: Math.max(quota - usage, 0), ratio: quota ? usage / quota : 0, persisted, level: classify(usage, quota) };
  } catch {
    return { supported: false, usage: 0, quota: 0, free: 0, ratio: 0, persisted: null, level: 'ok' };
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

/** Time left, rounded up so it only reads 0:00 at the very end and elapsed + remaining always adds up to the length. */
export function formatRemaining(duration: number, elapsed: number): string {
  return `-${formatTime(Math.ceil(Math.max(duration - elapsed, 0) - 1e-6))}`;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
