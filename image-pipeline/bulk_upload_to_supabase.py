"""
bulk_upload_to_supabase.py
--------------------------
dasaram_diagram_db/ 로컬 인덱스의 모든 이미지를 Supabase Storage + diagram_images 테이블에 일괄 업로드.

사용법:
    python bulk_upload_to_supabase.py [--dry-run] [--limit N] [--resume]

결과:
    - Supabase Storage `diagram-images/{subject}/{source}/{filename}` 업로드
    - diagram_images 테이블에 메타데이터 row 삽입
    - dasaram_diagram_db/index.json 각 이미지에 `supabase_id`, `storage_path`, `public_url` 추가
    - dasaram_diagram_db/upload_checkpoint.json 에 진행상황 기록 (resume 지원)
"""

import os
import sys
import json
import time
import re
import hashlib
import argparse
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv


def slugify_for_storage(name: str) -> str:
    """Supabase Storage 호환 키로 변환 (ASCII safe).
    한글/특수문자 제거. 오리지널 이름은 source_name으로 DB에 그대로 저장.
    """
    if not name:
        return "unknown"
    # 공백/괄호/특수문자 → _
    slug = re.sub(r"[^\w\-.]", "_", name, flags=re.UNICODE)
    # ASCII 아닌 문자는 제거하고 hash suffix 추가
    ascii_only = re.sub(r"[^A-Za-z0-9_.\-]", "", slug)
    if len(ascii_only) < 3 or ascii_only != slug:
        # 한글 등 비ASCII → hash 기반 ID 사용
        h = hashlib.md5(name.encode("utf-8")).hexdigest()[:10]
        return f"{ascii_only[:20].strip('_-.') or 'src'}_{h}"
    return slug[:80]

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")


DB_ROOT = Path(__file__).parent / "dasaram_diagram_db"
INDEX_PATH = DB_ROOT / "index.json"
CHECKPOINT_PATH = DB_ROOT / "upload_checkpoint.json"
BUCKET = "diagram-images"


def guess_content_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".tiff": "image/tiff",
    }.get(ext, "image/png")


def load_index():
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_index(index):
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def load_checkpoint():
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed_ids": [], "failed": [], "started_at": datetime.now().isoformat()}


def save_checkpoint(cp):
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(cp, f, ensure_ascii=False, indent=2)


def get_supabase_client():
    from supabase import create_client

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요")
    return create_client(url, key)


def ensure_bucket(supabase):
    try:
        supabase.storage.get_bucket(BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(BUCKET, {"public": True})
            print(f"[bucket] Created: {BUCKET}")
        except Exception as e:
            print(f"[bucket] Create skipped ({e})")


def upload_one(supabase, img_entry: dict) -> dict:
    """단일 이미지 업로드 + DB row 생성. 성공 시 row dict 반환."""
    filepath_rel = img_entry["filepath"]
    local_path = DB_ROOT / filepath_rel
    if not local_path.exists():
        raise FileNotFoundError(f"Local file missing: {local_path}")

    filename = local_path.name
    subject = img_entry.get("subject", "math")
    source_name = img_entry.get("source", "unknown")

    # Storage 경로 — 한글 source_name을 slug로 변환 (DB의 source_name은 원본 유지)
    slug_source = slugify_for_storage(source_name)
    slug_filename = slugify_for_storage(filename)
    storage_path = f"{subject}/{slug_source}/{slug_filename}"

    # Storage 업로드 (upsert)
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    try:
        supabase.storage.from_(BUCKET).upload(
            storage_path,
            file_bytes,
            {"content-type": guess_content_type(filename), "upsert": "true"},
        )
    except Exception as e:
        # 이미 존재 + upsert 무시되는 경우 pass
        msg = str(e)
        if "Duplicate" not in msg and "already exists" not in msg:
            raise

    public_url = supabase.storage.from_(BUCKET).get_public_url(storage_path)

    tags = img_entry.get("tags", {})
    if isinstance(tags, dict):
        diagram_type = tags.get("diagram_type", "미분류")
        tags_json = json.dumps(tags, ensure_ascii=False)
    else:
        diagram_type = "미분류"
        tags_json = json.dumps({}, ensure_ascii=False)

    row = {
        "filename": filename,
        "storage_path": storage_path,
        "public_url": public_url,
        "source_name": source_name,
        "subject": subject,
        "page_number": img_entry.get("page", 0),
        "width": img_entry.get("width", 0),
        "height": img_entry.get("height", 0),
        "phash": img_entry.get("phash", ""),
        "file_hash": img_entry.get("file_hash", ""),
        "diagram_type": diagram_type,
        "tags": tags_json,
        "is_enhanced": "_enhanced" in filename,
    }

    # file_hash 기준 중복 체크
    existing = (
        supabase.table("diagram_images")
        .select("id, storage_path")
        .eq("file_hash", row["file_hash"])
        .execute()
    )
    if existing.data:
        return {**existing.data[0], "storage_path": storage_path, "public_url": public_url, "_dup": True}

    result = supabase.table("diagram_images").insert(row).execute()
    if result.data:
        return {**result.data[0], "_dup": False}
    raise RuntimeError("Insert returned empty data")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="N개만 처리 (0=전체)")
    parser.add_argument("--resume", action="store_true", help="체크포인트 이어서 재시작")
    parser.add_argument("--every", type=int, default=50, help="N개마다 checkpoint 저장")
    args = parser.parse_args()

    index = load_index()
    images = index.get("images", [])
    print(f"[index] total {len(images)}개 이미지")

    checkpoint = load_checkpoint() if args.resume else {"completed_ids": [], "failed": [], "started_at": datetime.now().isoformat()}
    completed = set(checkpoint.get("completed_ids", []))
    print(f"[checkpoint] 이미 완료: {len(completed)}개")

    todo = [img for img in images if img["id"] not in completed]
    print(f"[todo] 처리할 이미지: {len(todo)}개")

    if args.limit > 0:
        todo = todo[: args.limit]
        print(f"[limit] {len(todo)}개만 처리")

    if args.dry_run:
        for img in todo[:5]:
            print(f"  - {img['id']} | {img['filename']} | {img['subject']}/{img['source']}")
        print(f"[dry-run] 실제 업로드 안 함. 전체 대상: {len(todo)}개")
        return

    supabase = get_supabase_client()
    ensure_bucket(supabase)

    ok = 0
    dup = 0
    fail = 0
    t0 = time.time()

    for i, img in enumerate(todo, 1):
        img_id = img["id"]
        try:
            result = upload_one(supabase, img)
            if result.get("_dup"):
                dup += 1
            else:
                ok += 1

            # index.json 업데이트 (원본에 supabase 정보 추가)
            img["supabase_id"] = result.get("id")
            img["storage_path"] = result.get("storage_path")
            img["public_url"] = result.get("public_url")

            checkpoint["completed_ids"].append(img_id)
        except Exception as e:
            fail += 1
            err_msg = str(e)[:200]
            checkpoint["failed"].append({"id": img_id, "error": err_msg})
            print(f"  [FAIL] {img_id}: {err_msg}", file=sys.stderr)

        # 진행 로그 + 주기적 저장
        if i % 10 == 0 or i == len(todo):
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed > 0 else 0
            eta = (len(todo) - i) / rate if rate > 0 else 0
            print(
                f"[{i}/{len(todo)}] ok={ok} dup={dup} fail={fail} "
                f"| {rate:.1f} img/s | ETA {eta/60:.1f}min"
            )

        if i % args.every == 0:
            save_checkpoint(checkpoint)
            save_index(index)

    # 최종 저장
    checkpoint["finished_at"] = datetime.now().isoformat()
    save_checkpoint(checkpoint)
    save_index(index)

    elapsed = time.time() - t0
    print(
        f"\n=== 완료 ===\n"
        f"성공: {ok}\n중복 스킵: {dup}\n실패: {fail}\n소요: {elapsed/60:.1f}분"
    )


if __name__ == "__main__":
    main()
