#!/usr/bin/env python3
"""
種子資料：產生不同長寬比的測試圖 → 簽章上傳 Cloudinary → 產出 SQL 匯入 D1。

這只是開發用的工具，不是正式匯入流程。正式流程是管理者在 /admin 用瀏覽器批次上傳
（照片在瀏覽器縮圖後直傳 Cloudinary，不經過 Worker）。

用法：
    python3 scripts/seed.py            # 產圖 + 上傳 + 寫出 seed.sql
    python3 scripts/seed.py --dry-run  # 只產圖，不上傳

secret 從 macOS Keychain 讀，不吃命令列參數也不寫進檔案。
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CLOUD = "nlmva1ui"
API_KEY = "REDACTED"
KEYCHAIN = ("cloudinary", "REDACTED")
ASSET_ROOT = "2026 Vue 圖片畫廊"

SOURCE = Path.home() / "Downloads" / "VCONF-teaser-dk-0-index-light.jpg"
OUT = Path("/private/tmp/claude-1563040353/-Users-he8658/32ab33a6-4650-443e-8c56-3571f632c3da/scratchpad/seed")

# 刻意混合橫式 / 直式 / 方形 —— justified 版型的排列好不好看，全看長寬比的分布
RATIOS = [3 / 2, 2 / 3, 1, 4 / 3, 3 / 4, 16 / 9, 5 / 4, 9 / 16]

ALBUMS = [
    ("opening", "開幕", "報到、佈置與開場前的現場", "2026-10-17"),
    ("speakers", "講者", "議程進行中的講者身影", "2026-10-17"),
    ("group-photo", "大合照", "散場前的全體合照", "2026-10-17"),
]
PER_ALBUM = 8


def api_secret() -> str:
    out = subprocess.run(
        ["security", "find-generic-password", "-s", KEYCHAIN[0], "-a", KEYCHAIN[1], "-w"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit("讀不到 Keychain 裡的 Cloudinary secret")
    return out.stdout.strip()


def average_color(img: Image.Image) -> str:
    small = img.convert("RGB").resize((1, 1))
    r, g, b = small.getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def make_image(src: Image.Image, index: int, ratio: float, label: str) -> tuple[Path, Image.Image]:
    """從長圖不同高度切一塊，再裁成指定長寬比 —— 這樣每張的內容與形狀都不一樣。"""
    sw, sh = src.size
    # 每張往下挪一段，繞回頭時錯開一點，避免重複
    band_h = sh // (PER_ALBUM * len(ALBUMS))
    top = (index * band_h) % max(1, sh - band_h)

    crop_h = min(sh - top, max(band_h, int(sw / ratio)))
    crop_w = min(sw, int(crop_h * ratio))
    if crop_w < sw:
        left = (sw - crop_w) // 2
    else:
        left = 0
        crop_w = sw
        crop_h = int(crop_w / ratio)

    img = src.crop((left, top, left + crop_w, top + crop_h))

    # 疊一個編號，方便在照片牆與燈箱裡一眼認出是哪一張
    draw = ImageDraw.Draw(img, "RGBA")
    box = int(min(img.size) * 0.28)
    hue = (index * 0.13) % 1.0
    r, g, b = (int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.55, 0.95))
    draw.rectangle([0, 0, box, box], fill=(r, g, b, 210))
    try:
        font = ImageFont.load_default(size=int(box * 0.55))
    except TypeError:
        font = ImageFont.load_default()
    draw.text((box * 0.3, box * 0.18), label, fill=(10, 12, 24, 255), font=font)

    path = OUT / f"seed-{index:02d}.jpg"
    img.convert("RGB").save(path, "JPEG", quality=85)
    return path, img


def sign(params: dict[str, str], secret: str) -> str:
    to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params)) + secret
    return hashlib.sha1(to_sign.encode()).hexdigest()


def upload(path: Path, photo_id: str, album_slug: str, secret: str) -> dict:
    params = {
        "asset_folder": f"{ASSET_ROOT}/{album_slug}",
        "public_id": f"vconf/{photo_id}",
        "timestamp": str(int(time.time())),
    }
    boundary = "----seed" + uuid.uuid4().hex

    def field(name: str, value: str) -> bytes:
        return f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()

    body = b"".join(field(k, v) for k, v in params.items())
    body += field("api_key", API_KEY) + field("signature", sign(params, secret))
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
             f'filename="{path.name}"\r\nContent-Type: image/jpeg\r\n\r\n').encode()
    body += path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"https://api.cloudinary.com/v1_1/{CLOUD}/image/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit(f"上傳失敗 {e.code}: {e.read().decode()[:300]}")


def q(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SOURCE)
    secret = "" if args.dry_run else api_secret()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    lines = ["DELETE FROM photos;", "DELETE FROM albums;"]
    index = 0

    for album_pos, (slug, name, desc, date) in enumerate(ALBUMS):
        album_id = str(uuid.uuid4())
        lines.append(
            "INSERT INTO albums (id, slug, name, description, cover_photo_id, event_date, "
            f"sort_order, is_visible, created_at, updated_at) VALUES ({q(album_id)}, {q(slug)}, "
            f"{q(name)}, {q(desc)}, NULL, {q(date)}, {(album_pos + 1) * 1000}, 1, {q(now)}, {q(now)});"
        )

        for n in range(PER_ALBUM):
            ratio = RATIOS[index % len(RATIOS)]
            photo_id = str(uuid.uuid4())
            path, img = make_image(src, index, ratio, str(index + 1))
            colour = average_color(img)

            if args.dry_run:
                w, h, size = *img.size, path.stat().st_size
            else:
                res = upload(path, photo_id, slug, secret)
                w, h, size = res["width"], res["height"], res["bytes"]
                print(f"  {index + 1:2d}/{len(ALBUMS) * PER_ALBUM}  {slug:12s} {w}x{h}  {size // 1024}KB")

            lines.append(
                "INSERT INTO photos (id, album_id, original_filename, caption, sort_order, width, "
                "height, stored_size, placeholder_color, taken_at, is_visible, created_at, updated_at) "
                f"VALUES ({q(photo_id)}, {q(album_id)}, {q(path.name)}, NULL, {(n + 1) * 1000}, "
                f"{w}, {h}, {size}, {q(colour)}, NULL, 1, {q(now)}, {q(now)});"
            )
            index += 1

    sql = Path("scripts/seed.sql")
    sql.write_text("\n".join(lines) + "\n")
    print(f"\n已寫出 {sql}（{len(lines)} 行）")


if __name__ == "__main__":
    main()
