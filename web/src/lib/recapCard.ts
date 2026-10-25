import { getArtUrl } from './art';
import { getArtPalette, rgbCss, seedPalette, type Palette } from './palette';
import { formatListening, type Period, type Recap } from './stats';

/** The words on the card, kept apart from the drawing so they can be tested. */
export interface CardText { eyebrow: string; time: string; stats: string; topLabel: string; top: string; songs: string[] }

const PERIOD_NOUN: Record<Period, string> = { day: 'My day', week: 'My week', month: 'My month', year: 'My year' };

export function recapCardText(recap: Recap, period: Period): CardText {
  const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;
  return {
    eyebrow: `${PERIOD_NOUN[period]} in music · ${recap.range.label}`,
    time: formatListening(recap.seconds),
    stats: [n(recap.plays, 'play'), n(recap.uniqueTracks, 'song'), n(recap.uniqueArtists, 'artist')].join('  ·  '),
    topLabel: 'Top artist',
    top: recap.topArtists[0]?.name ?? '',
    songs: recap.topTracks.slice(0, 3).map((t, i) => `${i + 1}  ${t.name}${t.sub ? ` · ${t.sub}` : ''}`),
  };
}

export const CARD_W = 1080;
export const CARD_H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws a 1080x1350 PNG of the recap: the top artist's cover, listening time, counts and top songs. Everything is read
 * from this device and drawn locally; nothing is uploaded. Returns null where canvas export is unavailable.
 */
export async function renderRecapCard(recap: Recap, period: Period): Promise<Blob | null> {
  const text = recapCardText(recap, period);
  const top = recap.topArtists[0];
  const [artUrl, palette] = top ? await Promise.all([getArtUrl(top.trackId), getArtPalette(top.trackId)]) : [null, null];
  const pal: Palette = palette ?? seedPalette(top?.name ?? 'cadence');
  const art = artUrl ? await loadImage(artUrl) : null;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = (weight: number, px: number) => `${weight} ${px}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;

  // Background: charcoal with the cover's colour, and a soft blur made by drawing the cover tiny and scaling it up
  // (canvas `filter` is not available in every Safari).
  ctx.fillStyle = '#101214';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (art) {
    const tiny = document.createElement('canvas');
    tiny.width = tiny.height = 10;
    tiny.getContext('2d')?.drawImage(art, 0, 0, 10, 10);
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tiny, -CARD_W * 0.25, -CARD_H * 0.15, CARD_W * 1.5, CARD_H * 1.3);
    ctx.globalAlpha = 1;
  }
  const glow = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, CARD_H * 0.8);
  glow.addColorStop(0, `rgb(${rgbCss(pal.accent)} / 0.5)`);
  glow.addColorStop(1, 'rgb(16 18 20 / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const shade = ctx.createLinearGradient(0, 0, 0, CARD_H);
  shade.addColorStop(0, 'rgb(16 18 20 / 0.15)');
  shade.addColorStop(0.5, 'rgb(16 18 20 / 0.75)');
  shade.addColorStop(1, 'rgb(16 18 20 / 0.97)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 88;
  const inner = CARD_W - pad * 2;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgb(245 245 245 / 0.7)';
  ctx.font = font(600, 34);
  ctx.fillText(fit(ctx, text.eyebrow.toUpperCase(), inner), pad, 140);

  // Cover
  const size = 440, ax = pad, ay = 200;
  ctx.save();
  ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, ax, ay, size, size, 36);
  ctx.fillStyle = `rgb(${rgbCss(pal.accent)})`;
  ctx.fill();
  ctx.restore();
  if (art) {
    ctx.save();
    roundRect(ctx, ax, ay, size, size, 36);
    ctx.clip();
    const s = Math.min(art.width, art.height);
    ctx.drawImage(art, (art.width - s) / 2, (art.height - s) / 2, s, s, ax, ay, size, size);
    ctx.restore();
  }

  let y = ay + size + 100;
  if (text.top) {
    ctx.fillStyle = 'rgb(245 245 245 / 0.6)';
    ctx.font = font(600, 32);
    ctx.fillText(text.topLabel, pad, y);
    y += 74;
    ctx.fillStyle = '#f5f5f5';
    ctx.font = font(800, 72);
    ctx.fillText(fit(ctx, text.top, inner), pad, y);
    y += 110;
  }
  ctx.fillStyle = '#f5f5f5';
  ctx.font = font(800, 96);
  ctx.fillText(fit(ctx, text.time, inner), pad, y);
  y += 58;
  ctx.fillStyle = 'rgb(245 245 245 / 0.7)';
  ctx.font = font(500, 34);
  ctx.fillText(fit(ctx, `of listening  ·  ${text.stats}`, inner), pad, y);

  y += 84;
  ctx.font = font(600, 36);
  for (const line of text.songs) {
    if (y > CARD_H - 120) break;
    ctx.fillStyle = 'rgb(245 245 245 / 0.92)';
    ctx.fillText(fit(ctx, line, inner), pad, y);
    y += 56;
  }

  ctx.fillStyle = 'rgb(245 245 245 / 0.45)';
  ctx.font = font(600, 30);
  ctx.fillText('Cadence', pad, CARD_H - 72);

  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/png'));
}

/** Opens the share sheet with the image, or saves it where sharing files is not supported. */
export async function shareOrSave(blob: Blob, name: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file] }); return 'shared'; } catch (e) { if ((e as { name?: string }).name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
