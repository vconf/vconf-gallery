#!/usr/bin/env python3
"""
把本機資料夾裡的活動照片匯入 Gallery（初次 backfill 用）。

它刻意做跟瀏覽器上傳器一模一樣的事，只是跑在本機：
  套用 EXIF 方向 → 縮到長邊 2400 → 重新編碼成 JPEG（順便洗掉所有 EXIF，含 GPS）
  → 算平均色當載入前底色 → 簽章上傳 Cloudinary → 產出 SQL 匯入 D1

正式的日常流程仍然是管理者在 /admin 批次上傳；這支只是為了讓第一批照片先上線。

用法：
    python3 scripts/import_local.py ~/Downloads/vconf-photos
    python3 scripts/import_local.py ~/Downloads/vconf-photos --dry-run
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import hashlib
import io
import json
import re
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from _cloudinary import api_key, api_secret, cloud_name

ASSET_ROOT = "2026 Vue 圖片畫廊"

MAX_EDGE = 2400
QUALITY = 85
UPLOAD_WORKERS = 4

# 資料夾名 → 相簿。只收現場照片；講者頭像與問卷文件不進 Gallery。
MONTHS = {"四月": ("04", "四月"), "五月": ("05", "五月"), "六月": ("06", "六月"),
          "七月": ("07", "七月"), "八月": ("08", "八月")}
PHOTO_DIR = "現場照片"


def sign(params: dict[str, str], secret: str) -> str:
    return hashlib.sha1(
        ("&".join(f"{k}={params[k]}" for k in sorted(params)) + secret).encode()
    ).hexdigest()


def prepare(path: Path) -> tuple[bytes, int, int, str, str | None]:
    """回傳 (jpeg bytes, width, height, 平均色, 拍攝時間)。"""
    with Image.open(path) as im:
        taken = None
        exif = im.getexif()
        if exif:
            # 36867 = DateTimeOriginal。只留這一個欄位，其餘（尤其 GPS）一律不保存
            raw = exif.get(36867) or exif.get(306)
            if raw and isinstance(raw, str):
                m = re.match(r"(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})", raw)
                if m:
                    y, mo, d, h, mi, s = m.groups()
                    taken = f"{y}-{mo}-{d}T{h}:{mi}:{s}Z"

        # 方向必須在縮圖前套用：重新編碼會洗掉 EXIF，之後就修不回來了
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

        colour = "#%02x%02x%02x" % im.resize((1, 1)).getpixel((0, 0))

        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=QUALITY, optimize=True)
        return buf.getvalue(), im.width, im.height, colour, taken


def upload(data: bytes, name: str, photo_id: str, album_slug: str, secret: str) -> dict:
    params = {
        "asset_folder": f"{ASSET_ROOT}/{album_slug}",
        "public_id": f"vconf/{photo_id}",
        "timestamp": str(int(time.time())),
    }
    boundary = "----imp" + uuid.uuid4().hex

    def field(k: str, v: str) -> bytes:
        return f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()

    body = b"".join(field(k, v) for k, v in params.items())
    body += field("api_key", api_key()) + field("signature", sign(params, secret))
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
             f'filename="{name}"\r\nContent-Type: image/jpeg\r\n\r\n').encode()
    body += data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"https://api.cloudinary.com/v1_1/{cloud_name()}/image/upload", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(req, timeout=180))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                raise SystemExit(f"{name} 上傳失敗：{e}")
            time.sleep(2 * (attempt + 1))


def purge_existing(secret: str) -> None:
    """清掉既有的 vconf/ 資產（種子測試圖），避免跟真照片混在一起。"""
    url = f"https://api.cloudinary.com/v1_1/{cloud_name()}/resources/image/upload?prefix=vconf/"
    req = urllib.request.Request(url, method="DELETE")
    token = __import__("base64").b64encode(f"{api_key()}:{secret}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    try:
        res = json.load(urllib.request.urlopen(req, timeout=120))
        print(f"  已清除舊資產 {len(res.get('deleted', {}))} 筆")
    except urllib.error.HTTPError as e:
        print(f"  清除舊資產失敗（略過）：{e.code}")


def q(v) -> str:
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    secret = "" if args.dry_run else api_secret()
    if not args.dry_run:
        print("清除既有資產…")
        purge_existing(secret)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    lines = ["DELETE FROM photos;", "DELETE FROM albums;"]

    for pos, (folder, (mm, label)) in enumerate(MONTHS.items()):
        src = args.root / folder / PHOTO_DIR
        if not src.is_dir():
            continue
        files = sorted(p for p in src.iterdir()
                       if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic"))
        if not files:
            continue

        slug = f"2026-{mm}"
        album_id = str(uuid.uuid4())
        print(f"\n{label}小聚（{slug}）— {len(files)} 張")

        prepared = []
        for i, path in enumerate(files, 1):
            data, w, h, colour, taken = prepare(path)
            prepared.append((path, data, w, h, colour, taken))
            if i % 20 == 0:
                print(f"  縮圖 {i}/{len(files)}")

        # 相簿日期用實際拍攝日，不要自己編
        dates = sorted(t[:10] for *_, t in prepared if t)
        event_date = dates[len(dates) // 2] if dates else None

        lines.append(
            "INSERT INTO albums (id, slug, name, description, cover_photo_id, event_date, "
            f"sort_order, is_visible, created_at, updated_at) VALUES ({q(album_id)}, {q(slug)}, "
            f"{q(label + '小聚')}, NULL, NULL, {q(event_date)}, {(pos + 1) * 1000}, 1, {q(now)}, {q(now)});")

        def do(item):
            path, data, w, h, colour, taken = item
            pid = str(uuid.uuid4())
            if args.dry_run:
                return pid, path, w, h, len(data), colour, taken
            res = upload(data, path.name, pid, slug, secret)
            return pid, path, res["width"], res["height"], res["bytes"], colour, taken

        with futures.ThreadPoolExecutor(UPLOAD_WORKERS) as pool:
            results = list(pool.map(do, prepared))

        for n, (pid, path, w, h, size, colour, taken) in enumerate(results):
            lines.append(
                "INSERT INTO photos (id, album_id, original_filename, caption, sort_order, width, "
                "height, stored_size, placeholder_color, taken_at, is_visible, created_at, updated_at) "
                f"VALUES ({q(pid)}, {q(album_id)}, {q(path.name)}, NULL, {(n + 1) * 1000}, {w}, {h}, "
                f"{size}, {q(colour)}, {q(taken)}, 1, {q(now)}, {q(now)});")
        print(f"  上傳完成 {len(results)} 張，日期 {event_date}")

    out = Path("scripts/import.sql")
    out.write_text("\n".join(lines) + "\n")
    print(f"\n已寫出 {out}（{len(lines)} 行）")


if __name__ == "__main__":
    main()
