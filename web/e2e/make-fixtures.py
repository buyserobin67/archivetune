"""Generates tiny MP3s with ID3 tags and cover art so the E2E run exercises artwork, palettes and grouping. Pure stdlib."""
import struct, zlib, math, os

def png(w, h, fn, alpha=False):
    raw = b''.join(b'\x00' + b''.join(bytes(fn(x / w, y / h)) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6 if alpha else 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

def synchsafe(n): return bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
def text(fid, s): d = b'\x03' + s.encode(); return fid + struct.pack('>I', len(d)) + b'\x00\x00' + d
def apic(img): d = b'\x00image/png\x00\x03\x00' + img; return b'APIC' + struct.pack('>I', len(d)) + b'\x00\x00' + d

def uslt(s):
    d = b'\x03eng\x00' + s.encode(); return b'USLT' + struct.pack('>I', len(d)) + b'\x00\x00' + d

def mp3(path, title, artist, album, trk, cover, genre=None, nframes=200, lyrics=None):
    frames = text(b'TIT2', title) + text(b'TPE1', artist) + text(b'TALB', album) + text(b'TRCK', str(trk)) + apic(cover)
    if genre: frames += text(b'TCON', genre)
    if lyrics: frames += uslt(lyrics)
    tag = b'ID3\x03\x00\x00' + synchsafe(len(frames)) + frames
    frame = b'\xff\xfb\x90\x00' + b'\x00' * 413  # MPEG1 L3 128kbps 44.1kHz, silent
    open(path, 'wb').write(tag + frame * nframes)

def grad(c1, c2):
    return lambda u, v: [int(c1[i] + (c2[i] - c1[i]) * (0.6 * v + 0.4 * u) + 18 * math.sin(u * 9) * math.cos(v * 7)) % 256 for i in range(3)]

os.makedirs('e2e/fixtures', exist_ok=True)
mp3('e2e/fixtures/ember.mp3', 'Ember Lines', 'Nova Vale', 'Afterglow', 1, png(160, 160, grad((235, 70, 40), (120, 20, 60))), 'Electronic')
mp3('e2e/fixtures/tide.mp3', 'Tide Study', 'Nova Vale', 'Afterglow', 2, png(160, 160, grad((20, 150, 200), (10, 40, 120))), 'Ambient')
mp3('e2e/fixtures/fern.mp3', 'A Very Long Track Title That Should Truncate Cleanly On Narrow Phones', 'The Extraordinarily Long Named Ensemble', 'Greenhouse Sessions Vol. 2', 1, png(160, 160, grad((60, 190, 90), (10, 80, 50))), 'Pop', lyrics='Embedded test lyrics, plain text.\nSecond line of the test text.\n\nSecond stanza of the test text.')
print('ok')

# extra tagged tracks so mood chips have enough real matches (3 per mood)
extra = [('Pulse Grid', 'Electronic'), ('Neon Run', 'Hip-Hop'), ('Drift One', 'Ambient'), ('Slow Lake', 'Classical')]
for i, (t, g) in enumerate(extra):
    mp3(f'e2e/fixtures/extra{i}.mp3', t, 'Test Artist', 'Test Album', i + 1, png(96, 96, grad((40 + i * 50, 80, 160 - i * 30), (10, 20 + i * 20, 60))), g, 40)

# synchronized lyrics (original placeholder text written for tests)
open('e2e/fixtures/ember.lrc', 'w').write('[ti:Ember Lines]\n[00:00.50]Test lyric line one\n[00:01.50]Test lyric line two\n[00:02.50]Test lyric line three\n[00:03.50]Test lyric line four\n[00:04.50]Test lyric line five\n')
print('ok')

# ---- non-square artwork fixtures (artwork bug reproduction) ----
def framed(w, h, inner_w, inner_h, bg, top=None):
    """A w x h image whose centre inner_w x inner_h area is the 'real' cover; the rest is flat padding."""
    x0, y0 = (w - inner_w) // 2, (h - inner_h) // 2
    def px(u, v):
        x, y = int(u * w), int(v * h)
        if x0 <= x < x0 + inner_w and y0 <= y < y0 + inner_h:
            return [int(40 + 200 * ((x - x0) / inner_w)), int(60 + 120 * ((y - y0) / inner_h)), 90]
        return bg
    return png(w, h, px)

# 16:9 frame with a centred square cover on flat green side bars (what YouTube "Topic" uploads embed)
mp3('e2e/fixtures/art-pillarbox.mp3', 'Pillarboxed Cover', 'Art Test', 'Art Test A', 1, framed(640, 360, 360, 360, [52, 74, 48]), 'Ambient', 40)
# true landscape photo (no padding at all)
mp3('e2e/fixtures/art-landscape.mp3', 'Landscape Cover', 'Art Test', 'Art Test B', 1, framed(640, 360, 640, 360, [0, 0, 0]), 'Ambient', 40)
# square cover that itself contains a letterbox: square image, flat bars top and bottom
mp3('e2e/fixtures/art-letterbox.mp3', 'Letterboxed Cover', 'Art Test', 'Art Test C', 1, framed(400, 400, 400, 225, [36, 38, 41]), 'Ambient', 40)
# tall portrait
mp3('e2e/fixtures/art-portrait.mp3', 'Portrait Cover', 'Art Test', 'Art Test D', 1, framed(300, 500, 300, 500, [0, 0, 0]), 'Ambient', 40)
print('art fixtures ok')

# THE USER'S CASE: a square PNG with alpha. A 16:9 frame (flat green sides around a centred square cover) sits in the
# middle; the rows above and below are fully transparent. The app background shows through them (and iOS paints them white).
def transparent_letterbox(size=480):
    fh = size * 9 // 16
    y0 = (size - fh) // 2
    inner = fh
    x0 = (size - inner) // 2
    def px(u, v):
        x, y = int(u * size), int(v * size)
        if y < y0 or y >= y0 + fh:
            return [0, 0, 0, 0]
        if x0 <= x < x0 + inner:
            return [int(40 + 120 * ((x - x0) / inner)), int(70 + 90 * ((y - y0) / fh)), 70, 255]
        return [48, 62, 44, 255]
    return png(size, size, px, alpha=True)
mp3('e2e/fixtures/art-transparent.mp3', 'Transparent Bars', 'Art Test', 'Art Test E', 1, transparent_letterbox(), 'Ambient', 40)
print('transparent fixture ok')
