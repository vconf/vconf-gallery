"""Cloudinary 的帳號設定：一律從環境變數讀，不寫死在腳本裡。

    CLOUDINARY_CLOUD_NAME        會出現在每個圖片 URL 裡，是公開資訊
    CLOUDINARY_API_KEY           隨每次簽章上傳一起送出，不是機密
    CLOUDINARY_KEYCHAIN_SERVICE  api_secret 放在 Keychain 的哪個 service（預設 cloudinary）
    CLOUDINARY_KEYCHAIN_ACCOUNT  同一個 service 底下有多筆時才需要指定是哪一筆

前兩個沒設時，回頭讀 repo 根目錄的 `.dev.vars`（Cloudflare 的本機環境變數慣例，
已被 .gitignore 忽略，本機開發本來就得有這個檔），所以日常使用不必另外 export。

**api_secret 只從 macOS Keychain 讀** —— 不吃環境變數也不吃命令列參數。
那兩條路都會留下痕跡：命令列參數會進 shell history、也會被同機的 `ps -E` 看見。

會寫成這個模組而不是各自定義，是因為原本三支腳本各抄一份相同的常數與 api_secret()，
換 cloud 或換帳號時只改到其中一支、另一支還指著舊帳號，是很難發現的錯。
"""
from __future__ import annotations

import os
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

DEV_VARS = Path(__file__).resolve().parent.parent / ".dev.vars"


@lru_cache(maxsize=1)
def _dev_vars() -> dict[str, str]:
    """讀 `.dev.vars`。格式是 KEY=value 的純文字，`#` 開頭是註解。"""
    if not DEV_VARS.exists():
        return {}
    pairs = {}
    for line in DEV_VARS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        pairs[key.strip()] = value.strip().strip('"').strip("'")
    return pairs


def _resolve(env: str, dev_var: str, what: str) -> str:
    value = os.environ.get(env) or _dev_vars().get(dev_var)
    if not value:
        sys.exit(f"缺少 {what}：請 export {env}，或在 {DEV_VARS} 裡設 {dev_var}")
    return value


def cloud_name() -> str:
    return _resolve("CLOUDINARY_CLOUD_NAME", "NUXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
                    "Cloudinary cloud name")


def api_key() -> str:
    return _resolve("CLOUDINARY_API_KEY", "NUXT_CLOUDINARY_API_KEY", "Cloudinary API key")


def api_secret() -> str:
    service = os.environ.get("CLOUDINARY_KEYCHAIN_SERVICE", "cloudinary")
    account = os.environ.get("CLOUDINARY_KEYCHAIN_ACCOUNT")

    # 不給 -a 時，只要該 service 底下唯一一筆就找得到；有多筆才需要指定 account
    cmd = ["security", "find-generic-password", "-s", service]
    if account:
        cmd += ["-a", account]

    out = subprocess.run([*cmd, "-w"], capture_output=True, text=True)
    if out.returncode != 0:
        where = f"service={service}" + (f", account={account}" if account else "")
        sys.exit(
            f"讀不到 Keychain 裡的 Cloudinary secret（{where}）。\n"
            "  存進去：security add-generic-password -s cloudinary -a <帳號> -w\n"
            "  同一個 service 有多筆時，用 CLOUDINARY_KEYCHAIN_ACCOUNT 指定是哪一筆。"
        )
    return out.stdout.strip()
