/** Raised when the browser refuses to store more data. The library is left unchanged. */
export class StorageQuotaError extends Error {
  constructor(message = 'Not enough storage space. Free up space on your iPhone or remove some tracks, then try again.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number; inner?: unknown };
  if (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014) return true;
  if (err.name === 'AbortError' && err.inner) return isQuotaError(err.inner);
  return err.inner ? isQuotaError(err.inner) : false;
}
