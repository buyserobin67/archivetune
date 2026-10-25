"""Generates tiny MP3s with ID3 tags and cover art so the E2E run exercises artwork, palettes and grouping. Pure stdlib."""
import struct, zlib, math, os

def png(w, h, fn):
    raw = b''.join(b'\x00' + b''.join(bytes(fn(x / w, y / h)) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

def synchsafe(n): return bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
def text(fid, s): d = b'\x03' + s.encode(); return fid + struct.pack('>I', len(d)) + b'\x00\x00' + d
def apic(img): d = b'\x00image/png\x00\x03\x00' + img; return b'APIC' + struct.pack('>I', len(d)) + b'\x00\x00' + d

def mp3(path, title, artist, album, trk, cover):
    frames = text(b'TIT2', title) + text(b'TPE1', artist) + text(b'TALB', album) + text(b'TRCK', str(trk)) + apic(cover)
    tag = b'ID3\x03\x00\x00' + synchsafe(len(frames)) + frames
    frame = b'\xff\xfb\x90\x00' + b'\x00' * 413  # MPEG1 L3 128kbps 44.1kHz, silent
    open(path, 'wb').write(tag + frame * 200)

def grad(c1, c2):
    return lambda u, v: [int(c1[i] + (c2[i] - c1[i]) * (0.6 * v + 0.4 * u) + 18 * math.sin(u * 9) * math.cos(v * 7)) % 256 for i in range(3)]

os.makedirs('e2e/fixtures', exist_ok=True)
mp3('e2e/fixtures/ember.mp3', 'Ember Lines', 'Nova Vale', 'Afterglow', 1, png(160, 160, grad((235, 70, 40), (120, 20, 60))))
mp3('e2e/fixtures/tide.mp3', 'Tide Study', 'Nova Vale', 'Afterglow', 2, png(160, 160, grad((20, 150, 200), (10, 40, 120))))
mp3('e2e/fixtures/fern.mp3', 'A Very Long Track Title That Should Truncate Cleanly On Narrow Phones', 'The Extraordinarily Long Named Ensemble', 'Greenhouse Sessions Vol. 2', 1, png(160, 160, grad((60, 190, 90), (10, 80, 50))))
print('ok')
