#!/usr/bin/env python3
"""Move legacy inline Forge media into local files without changing schema."""

import base64
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
import sys

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from backend.db.supabase_client import supabase  # noqa: E402

MEDIA_ROOT = Path(os.getenv("FORGE_MEDIA_ROOT", ROOT / ".local" / "forge-media"))
PUBLIC_BASE = os.getenv("FORGE_MEDIA_PUBLIC_BASE", "http://127.0.0.1:8000/forge-media").rstrip("/")
BACKUP_PATH = MEDIA_ROOT.parent / "forge-media-migration-backup.json"
THUMBNAIL_SCRIPT = ROOT / "scripts" / "create-forge-thumbnail.cjs"
DATA_URL = re.compile(r"^data:([^;,]+)?;base64,(.+)$", re.DOTALL | re.IGNORECASE)


def decode_inline(value: str):
    match = DATA_URL.match(value or "")
    if not match:
        return None
    content_type = match.group(1) or "application/octet-stream"
    return content_type, base64.b64decode(match.group(2), validate=True)


def safe_part(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", value or "")[:80] or "unassigned"


def extension(content_type: str, filename: str = "") -> str:
    suffix = Path(filename).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
        return suffix
    return mimetypes.guess_extension(content_type) or ".bin"


def store(project_id: str, row_id: str, content_type: str, raw: bytes, filename: str = ""):
    directory = MEDIA_ROOT / safe_part(project_id)
    directory.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    original = directory / f"{safe_part(row_id)}-{digest}-original{extension(content_type, filename)}"
    if not original.exists():
        original.write_bytes(raw)
    thumbnail = directory / f"{safe_part(row_id)}-{digest}-thumbnail.webp"
    thumbnail_url = None
    if content_type.startswith("image/"):
        completed = subprocess.run(["node", str(THUMBNAIL_SCRIPT), str(original), str(thumbnail)], check=False)
        if completed.returncode == 0:
            thumbnail_url = f"{PUBLIC_BASE}/{safe_part(project_id)}/{thumbnail.name}"
    return f"{PUBLIC_BASE}/{safe_part(project_id)}/{original.name}", thumbnail_url


def main():
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    files = supabase.table("forge_files").select("id,project_id,file_name,file_type,file_url,metadata").execute().data or []
    projects = supabase.table("forge_projects").select("id,cover_image_url").execute().data or []
    legacy_files = [row for row in files if decode_inline(row.get("file_url") or "")]
    legacy_projects = [row for row in projects if decode_inline(row.get("cover_image_url") or "")]
    backup = {"forge_files": legacy_files, "forge_projects": legacy_projects}
    BACKUP_PATH.write_text(json.dumps(backup), encoding="utf-8")

    migrated_urls = {}
    for row in legacy_files:
        content_type, raw = decode_inline(row["file_url"])
        url, thumbnail_url = store(row.get("project_id") or "unassigned", row["id"], content_type, raw, row.get("file_name") or "")
        metadata = {**(row.get("metadata") or {}), "storage": "local_linux", "migrated_from": "inline_base64"}
        if thumbnail_url:
            metadata["thumbnail_url"] = thumbnail_url
        supabase.table("forge_files").update({"file_url": url, "file_size": len(raw), "metadata": metadata}).eq("id", row["id"]).execute()
        migrated_urls[row["file_url"]] = url

    for row in legacy_projects:
        old_url = row["cover_image_url"]
        url = migrated_urls.get(old_url)
        if not url:
            content_type, raw = decode_inline(old_url)
            url, _ = store(row["id"], f"cover-{row['id']}", content_type, raw, "cover")
        supabase.table("forge_projects").update({"cover_image_url": url}).eq("id", row["id"]).execute()

    print(json.dumps({"migrated_files": len(legacy_files), "migrated_covers": len(legacy_projects), "media_root": str(MEDIA_ROOT), "backup": str(BACKUP_PATH)}))


if __name__ == "__main__":
    main()
