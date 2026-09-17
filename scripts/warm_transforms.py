#!/usr/bin/env python3
"""
把所有交付尺寸預先請求一次，讓 Cloudinary 先把衍生檔產生好。

為什麼需要：Cloudinary 的轉檔是 lazy 的 —— 某個 (原圖, 參數) 組合第一次被請求時才現場產生，
實測冷的要 0.8~1.9 秒，熱的只要 0.13~0.19 秒。不預熱的話，每個訪客都在幫我們付第一次的錢。

注意 f_auto 會依 Accept 產生不同的衍生檔（AVIF 與 WebP 是兩份），所以兩種都要暖。

用法：python3 scripts/warm_transforms.py
"""
from __future__ import annotations

import concurrent.futures as futures
import json
import subprocess
import time
import urllib.request

from _cloudinary import cloud_name

TRANSFORMS = [
    "f_auto,q_auto:good,c_limit,h_320",
    "f_auto,q_auto:good,c_limit,h_640",
    "f_auto,q_auto:good,c_limit,h_480",
    "f_auto,q_auto:good,c_limit,h_960",
    "f_auto,q_auto:good,c_limit,w_1200",
    "f_auto,q_auto:good,c_limit,w_1600",
    "f_auto,q_auto:good,c_limit,w_2000",
]
# 現代瀏覽器會拿到 AVIF，舊一點的拿 WebP —— 兩種都得先產生
ACCEPTS = [
    "image/avif,image/webp,image/apng,*/*;q=0.8",
    "image/webp,image/apng,*/*;q=0.8",
]
WORKERS = 8


def photo_ids() -> list[str]:
    out = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "vconf-gallery", "--remote",
         "--command", "SELECT id FROM photos ORDER BY album_id, sort_order", "--json"],
        capture_output=True, text=True,
    )
    start = out.stdout.index("[")
    return [r["id"] for r in json.loads(out.stdout[start:])[0]["results"]]


def warm(job: tuple[str, str, str]) -> float:
    pid, transform, accept = job
    url = f"https://res.cloudinary.com/{cloud_name()}/image/upload/{transform}/vconf/{pid}"
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "Mozilla/5.0"})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
    except Exception:  # noqa: BLE001
        return -1.0
    return time.time() - started


def main() -> None:
    ids = photo_ids()
    jobs = [(pid, t, a) for pid in ids for t in TRANSFORMS for a in ACCEPTS]
    print(f"{len(ids)} 張 × {len(TRANSFORMS)} 尺寸 × {len(ACCEPTS)} 格式 = {len(jobs)} 次預熱")

    done, failed, slow = 0, 0, 0
    started = time.time()
    with futures.ThreadPoolExecutor(WORKERS) as pool:
        for elapsed in pool.map(warm, jobs):
            done += 1
            if elapsed < 0:
                failed += 1
            elif elapsed > 1.0:
                slow += 1
            if done % 200 == 0:
                print(f"  {done}/{len(jobs)}  失敗 {failed}  冷啟(>1s) {slow}")

    print(f"\n完成 {done} 次，失敗 {failed}，其中 {slow} 次是冷啟；共 {time.time() - started:.0f} 秒")


if __name__ == "__main__":
    main()
