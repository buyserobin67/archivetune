import { db as defaultDb, type CadenceDB } from './db';

/** The image to show for a track: the trimmed copy when one exists and is enabled, else the original bytes. */
export async function getArtBlob(trackId: string, d: CadenceDB = defaultDb): Promise<Blob | undefined> {
  const edit = await d.artEdits.get(trackId);
  if (edit?.blob && !edit.disabled) return edit.blob;
  return (await d.art.get(trackId))?.blob;
}

/** Always the bytes that were embedded in the audio file. */
export async function getOriginalArtBlob(trackId: string, d: CadenceDB = defaultDb): Promise<Blob | undefined> {
  return (await d.art.get(trackId))?.blob;
}
