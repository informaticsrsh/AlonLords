#!/usr/bin/env python3
"""Запускає вебверсію Empire Lords локально для тестування.

Запуск у PowerShell з кореня проєкту:
    python start_local.py

Зупинка сервера: Ctrl+C
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
LOCAL_URL = "http://localhost:5173"
VITE_CACHE_DIRS = (
    PROJECT_DIR / "apps" / "web" / "node_modules" / ".vite",
    PROJECT_DIR / "node_modules" / ".vite",
)


def npm_command() -> str:
    """Повертає відповідну назву npm для поточної ОС."""
    return "npm.cmd" if os.name == "nt" else "npm"


def ensure_dependencies(npm: str) -> None:
    """Встановлює залежності, якщо їх ще немає."""
    if (PROJECT_DIR / "node_modules").is_dir():
        return

    print("Залежності не знайдено. Виконую npm install...")
    subprocess.run([npm, "install"], cwd=PROJECT_DIR, check=True)


def clear_vite_cache() -> None:
    """Видаляє кеш Vite, щоб наступний запуск зібрав актуальні ресурси."""
    removed_cache = False
    for cache_dir in VITE_CACHE_DIRS:
        if cache_dir.is_dir():
            shutil.rmtree(cache_dir)
            removed_cache = True

    if removed_cache:
        print("Кеш Vite очищено.")


def open_browser_when_ready() -> None:
    """Трохи зачекати на Vite, після чого відкрити локальну гру."""
    time.sleep(2)
    webbrowser.open(LOCAL_URL)


def main() -> int:
    npm = npm_command()
    if shutil.which(npm) is None:
        print(
            "Не знайдено Node.js/npm. Встановіть Node.js LTS з https://nodejs.org/ "
            "та запустіть скрипт повторно.",
            file=sys.stderr,
        )
        return 1

    try:
        ensure_dependencies(npm)
        clear_vite_cache()
        print(f"Запускаю гру: {LOCAL_URL}")
        print("Щоб зупинити сервер, натисніть Ctrl+C.")
        threading.Thread(target=open_browser_when_ready, daemon=True).start()
        return subprocess.call(
            [npm, "run", "dev", "--workspace=@empire/web", "--", "--force"],
            cwd=PROJECT_DIR,
        )
    except subprocess.CalledProcessError as error:
        print(f"Не вдалося виконати npm (код {error.returncode}).", file=sys.stderr)
        return error.returncode
    except KeyboardInterrupt:
        print("\nЛокальний сервер зупинено.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
