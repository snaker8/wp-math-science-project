"""
Supabase Storage에 도식 이미지를 업로드하고 diagram_images 테이블에 메타데이터를 저장
"""

import os
import json
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()


def get_supabase_client():
    """Supabase 클라이언트 생성 (service_role 키 사용)"""
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요"
        )
    return create_client(url, key)


def upload_diagram_image(
    local_path: str,
    source_name: str,
    subject: str,
    metadata: dict,
) -> dict:
    """
    이미지를 Supabase Storage에 업로드하고 diagram_images 테이블에 삽입한다.

    Returns:
        삽입된 row dict (id, storage_path, public_url 포함)
    """
    supabase = get_supabase_client()
    filename = Path(local_path).name

    # Storage 경로: diagram-images/{subject}/{source_name}/{filename}
    storage_path = f"{subject}/{source_name}/{filename}"

    # 1. Storage 업로드
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    bucket = "diagram-images"

    # 버킷이 없으면 생성 시도
    try:
        supabase.storage.get_bucket(bucket)
    except Exception:
        try:
            supabase.storage.create_bucket(bucket, {"public": True})
        except Exception:
            pass  # 이미 존재하면 무시

    # 업로드 (upsert로 덮어쓰기 허용)
    supabase.storage.from_(bucket).upload(
        storage_path,
        file_bytes,
        {"content-type": _guess_content_type(filename), "upsert": "true"},
    )

    # public URL 생성
    public_url = supabase.storage.from_(bucket).get_public_url(storage_path)

    # 2. DB 테이블 삽입
    row = {
        "filename": filename,
        "storage_path": storage_path,
        "public_url": public_url,
        "source_name": source_name,
        "subject": subject,
        "page_number": metadata.get("page", 0),
        "width": metadata.get("width", 0),
        "height": metadata.get("height", 0),
        "phash": metadata.get("phash", ""),
        "file_hash": metadata.get("file_hash", ""),
        "diagram_type": metadata.get("tags", {}).get("diagram_type", "미분류"),
        "tags": json.dumps(metadata.get("tags", {}), ensure_ascii=False),
        "is_enhanced": "_enhanced" in filename,
    }

    result = supabase.table("diagram_images").insert(row).execute()

    if result.data:
        return result.data[0]
    return {**row, "id": None}


def _guess_content_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".tiff": "image/tiff",
    }.get(ext, "image/png")
