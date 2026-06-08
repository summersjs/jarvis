from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _path(name: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / name


def read_json(name: str, default: Any):
    path = _path(name)
    if not path.exists():
        return default

    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def write_json(name: str, data: Any):
    path = _path(name)
    path.write_text(json.dumps(data, indent=2, sort_keys=True))
    return data
