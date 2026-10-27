#!/usr/bin/env python3
"""Build all browser and installed-app icons from the selected MX GetServer artwork."""
import base64
import io
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "mx-getserver-icon.svg"
svg = SOURCE.read_text(encoding="utf-8")
match = re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)', svg)
if match is None:
    raise SystemExit("Selected icon image not found in assets/mx-getserver-icon.svg")
art = Image.open(io.BytesIO(base64.b64decode(match.group(1), validate=True))).convert("RGB")
if art.size != (160, 160):
    raise SystemExit("Unexpected source icon dimensions")

def resize(size):
    return art.resize((size, size), Image.Resampling.LANCZOS)

def png(name, size, image=None):
    target = ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    (image or resize(size)).save(target, format="PNG", optimize=True)
    print(f"Built {target.relative_to(ROOT)}")

png("favicon.png", 32)
png("apple-touch-icon.png", 180)
png("icons/icon-192.png", 192)
png("icons/icon-512.png", 512)
maskable = Image.new("RGB", (512, 512), "#080c15")
maskable.paste(resize(416), ((512 - 416) // 2, (512 - 416) // 2))
png("icons/icon-maskable-512.png", 512, maskable)
resize(256).save(ROOT / "favicon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64)])
print("Built favicon.ico")
