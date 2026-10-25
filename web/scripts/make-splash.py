#!/usr/bin/env python3
"""Generates the iOS launch images (public/splash/*.png): flat app background with the Cadence bars centred.
iOS uses these sizes to decide how big a Home Screen app's window is, so every current iPhone size is listed.
Run: python3 scripts/make-splash.py"""
import os
from PIL import Image, ImageDraw

SIZES = [  # (css width, css height, pixel ratio)
    (440, 956, 3), (420, 912, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (428, 926, 3),
    (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2), (320, 568, 2),
]
BG = (16, 18, 20)
BARS = [22, 40, 58, 36, 50, 28]

os.makedirs('public/splash', exist_ok=True)
for w, h, r in SIZES:
    W, H = w * r, h * r
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    u = min(W, H) / 100 * 0.62          # size of one design unit
    x0 = W / 2 - 27 * u
    for i, bh in enumerate(BARS):
        cx = x0 + (23 + i * 9 - 23 + 2.3) * u
        half = bh / 2 * u
        a = int(255 * (0.5 + (i % 3) * 0.2) * 0.9)
        d.rounded_rectangle([cx - 2.3 * u, H / 2 - half, cx + 2.3 * u, H / 2 + half], radius=2.3 * u, fill=(a, a, a))
    im.save(f'public/splash/splash-{W}x{H}.png', optimize=True)
print(len(SIZES), 'launch images')
