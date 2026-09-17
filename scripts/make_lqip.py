#!/usr/bin/env python3
"""
從本機原始照片產生 LQIP，寫成 UPDATE 語句。

不重新上傳任何東西 —— 只補 D1 的 placeholder 欄位。
比對鍵是（相簿 slug, original_filename），跟 import_local.py 寫進去的一致。

用法：python3 scripts/make_lqip.py ~/Downloads/vconf-photos
"""
from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

from PIL import Image, ImageOps

MONTHS = {"四月": "04", "五月": "05", "六月": "06", "七月": "07", "八月": "08"}
PHOTO_DIR = "現場照片"
LQIP_WIDTH = 20
LQIP_QUALITY = 35


def lqip(path: Path) -> str | None:
    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            w, h = im.size
            im = im.resize((LQIP_WIDTH, max(1, round(LQIP_WIDTH * h / w))), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=LQIP_QUALITY, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:  # noqa: BLE001
        print(f"  略過 {path.name}: {e}", file=sys.stderr)
        return None


def main() -> None:
    root = Path(sys.argv[1]).expanduser()
    lines, sizes = [], []

    for folder, mm in MONTHS.items():
        src = root / folder / PHOTO_DIR
        if not src.is_dir():
            continue
        slug = f"2026-{mm}"
        files = sorted(p for p in src.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
        for path in files:
            data = lqip(path)
            if not data:
                continue
            sizes.append(len(data))
            name = path.name.replace("'", "''")
            lines.append(
                f"UPDATE photos SET placeholder = '{data}' "
                f"WHERE original_filename = '{name}' "
                f"AND album_id = (SELECT id FROM albums WHERE slug = '{slug}');"
            )
        print(f"  {slug}  {len(files)} 張")

    out = Path("scripts/lqip.sql")
    out.write_text("\n".join(lines) + "\n")
    avg = sum(sizes) // len(sizes) if sizes else 0
    print(f"\n{len(lines)} 筆，平均 {avg} bytes/張，總計 {sum(sizes) // 1024} KB → {out}")


if __name__ == "__main__":
    main()
