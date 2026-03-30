"""
이미지 파이프라인 FastAPI 서버
- HWP/PDF에서 이미지 추출
- 이미지 보정 (업스케일 + 샤프닝 + 노이즈 제거)
- DB 인덱스 관리
- Supabase Storage 업로드

Usage:
  pip install -r requirements.txt
  uvicorn server:app --host 0.0.0.0 --port 8200
"""

import io
import os
import json
import shutil
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# 프로젝트 루트의 .env 파일에서 ANTHROPIC_API_KEY 등 로드
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path, override=True)
print(f"[Server] .env loaded from {_env_path}, ANTHROPIC_API_KEY={'SET' if os.getenv('ANTHROPIC_API_KEY') else 'MISSING'}")

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from extractors import HWPImageExtractor, PDFImageExtractor
from enhancer import ImageEnhancer
from db_manager import DiagramDBManager
from matcher import ImageMatcher
from tagger import tag_single, tag_batch, submit_batch, get_batch_results

app = FastAPI(
    title="Dasaram Image Pipeline",
    description="HWP/PDF 도식 이미지 추출 → 보정 → DB 저장 파이프라인",
    version="1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB 매니저 + 매처 — v2
DB_ROOT = os.getenv("DIAGRAM_DB_ROOT", "./dasaram_diagram_db")
db_manager = DiagramDBManager(DB_ROOT)
image_matcher = ImageMatcher(db_manager)

# ★ 처리 상태 추적 (진행상황 표시용)
processing_status: dict = {"active": False, "current_page": 0, "total_pages": 0, "source": "", "phase": ""}

# ★ 태깅 작업 상태 (백그라운드 태스크용)
tagging_status: dict = {"active": False, "current": 0, "total": 0, "tagged": 0, "errors": 0, "phase": "idle"}


@app.get("/health")
async def health():
    stats = db_manager.stats()
    return {"status": "ok", "db_stats": stats, "processing": processing_status, "tagging": tagging_status}


@app.post("/extract")
async def extract_images(
    file: UploadFile = File(...),
    subject: str = Form("math"),
    source_name: str = Form(""),
    science_subject: str = Form(""),
    enhance: bool = Form(True),
    upload_to_supabase: bool = Form(False),
    auto_tag: bool = Form(True),
    min_width: int = Form(200),
    min_height: int = Form(200),
):
    """
    HWP/PDF 파일에서 이미지를 추출하고 보정한다.

    Returns:
        {
            "source": str,
            "file_type": "PDF" | "HWP",
            "extracted_count": int,
            "enhanced_count": int,
            "uploaded_count": int,
            "images": [{ id, filename, width, height, ... }]
        }
    """
    if not source_name:
        source_name = Path(file.filename or "unknown").stem

    # 임시 디렉토리에 파일 저장
    tmp_dir = tempfile.mkdtemp(prefix="img_pipeline_")
    tmp_file = os.path.join(tmp_dir, file.filename or "upload")

    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        # 파일 타입 감지
        file_ext = Path(tmp_file).suffix.lower()
        min_size = (min_width, min_height)

        def log_progress(current: int, total: int):
            processing_status["current_page"] = current
            processing_status["total_pages"] = total
            if current % 10 == 0 or current == total:
                print(f"[Extract] {source_name}: {current}/{total} 페이지 처리 중...")

        processing_status["active"] = True
        processing_status["source"] = source_name
        processing_status["phase"] = "extracting"

        if file_ext == ".hwp":
            file_type = "HWP"
            extracted = _extract_hwp(tmp_file, tmp_dir, min_size)
        elif file_ext == ".pdf":
            file_type = "PDF"
            extracted = _extract_pdf(tmp_file, tmp_dir, min_size, on_progress=log_progress)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"지원하지 않는 파일 형식: {file_ext} (PDF, HWP만 가능)",
            )

        print(f"[Extract] {source_name}: 추출 완료 {len(extracted)}개 이미지")
        processing_status["phase"] = "enhancing"

        # 보정
        enhanced_count = 0
        if enhance:
            enhancer = ImageEnhancer()
            for i, item in enumerate(extracted):
                try:
                    result = enhancer.enhance(item["filepath"])
                    item["enhanced_path"] = result["output_path"]
                    item["enhanced_size"] = result["enhanced_size"]
                    item["upscaled"] = result["upscaled"]
                    item["is_grayscale"] = result["is_grayscale"]
                    enhanced_count += 1
                    if (i + 1) % 10 == 0:
                        print(f"[Extract] {source_name}: 보정 {i + 1}/{len(extracted)}...")
                except Exception as e:
                    item["enhance_error"] = str(e)

        # DB 인덱스에 추가
        db_entries = []
        for item in extracted:
            entry = db_manager.add_image(
                image_path=item["filepath"],
                source_name=source_name,
                subject=subject,
                page=item.get("page", 0),
                enhanced_path=item.get("enhanced_path"),
                science_subject=science_subject or None,
            )
            if entry:
                db_entries.append(entry)
                item["db_id"] = entry["id"]

        db_manager.add_source(source_name, tmp_file, subject, len(extracted))
        db_manager.save_index()

        # ★ AI 태깅 (추출 직후 자동 실행)
        tagged_count = 0
        if auto_tag and db_entries:
            processing_status["phase"] = "tagging"
            try:
                tag_paths = []
                for entry in db_entries:
                    abs_path = str(db_manager.db_root / entry["filepath"])
                    if os.path.exists(abs_path):
                        tag_paths.append(abs_path)

                if tag_paths:
                    print(f"[Extract] {source_name}: AI 태깅 시작 ({len(tag_paths)}개)...")
                    tag_results = tag_batch(tag_paths)

                    # DB 인덱스에 태그 반영
                    path_to_result = {r["_source_path"]: r for r in tag_results if "error" not in r}
                    for img in db_manager.index["images"]:
                        abs_path = str(db_manager.db_root / img["filepath"])
                        if abs_path in path_to_result:
                            result = path_to_result[abs_path]
                            img["tags"] = result
                            if result.get("unit_code"):
                                img["unit_code"] = result["unit_code"]
                            if result.get("unit_name"):
                                img["unit_name"] = result["unit_name"]
                            tagged_count += 1

                    db_manager.save_index()
                    print(f"[Extract] {source_name}: AI 태깅 완료 ({tagged_count}/{len(tag_paths)})")
            except Exception as e:
                print(f"[Extract] {source_name}: AI 태깅 오류 — {e}")

        processing_status["phase"] = "done"
        processing_status["active"] = False

        # Supabase 업로드 (옵션)
        uploaded_count = 0
        if upload_to_supabase and db_entries:
            try:
                from supabase_uploader import upload_diagram_image

                for entry in db_entries:
                    abs_path = str(db_manager.db_root / entry["filepath"])
                    try:
                        upload_diagram_image(
                            local_path=abs_path,
                            source_name=source_name,
                            subject=subject,
                            metadata=entry,
                        )
                        uploaded_count += 1
                    except Exception:
                        pass
            except ImportError:
                pass  # supabase 패키지 미설치

        return JSONResponse(
            {
                "source": source_name,
                "file_type": file_type,
                "extracted_count": len(extracted),
                "enhanced_count": enhanced_count,
                "tagged_count": tagged_count,
                "uploaded_count": uploaded_count,
                "db_entries_added": len(db_entries),
                "images": [
                    {
                        "db_id": item.get("db_id"),
                        "filename": item["filename"],
                        "page": item.get("page", 0),
                        "width": item["width"],
                        "height": item["height"],
                        "format": item.get("format", "png"),
                        "upscaled": item.get("upscaled", False),
                        "is_grayscale": item.get("is_grayscale"),
                        "enhanced_size": item.get("enhanced_size"),
                    }
                    for item in extracted
                ],
            }
        )

    finally:
        # 임시 파일 정리 (DB에 복사된 후)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


@app.post("/enhance")
async def enhance_single(
    file: UploadFile = File(...),
    target_short_side: int = Form(600),
):
    """단일 이미지 보정"""
    tmp_dir = tempfile.mkdtemp(prefix="img_enhance_")
    tmp_file = os.path.join(tmp_dir, file.filename or "image.png")

    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        result = ImageEnhancer.enhance(tmp_file, target_short_side=target_short_side)

        # 보정된 이미지를 base64로 반환
        import base64

        with open(result["output_path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        return JSONResponse(
            {
                "original_size": result["original_size"],
                "enhanced_size": result["enhanced_size"],
                "upscaled": result["upscaled"],
                "is_grayscale": result["is_grayscale"],
                "image_base64": b64,
            }
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/db/stats")
async def db_stats():
    """DB 통계"""
    return db_manager.stats()


@app.get("/db/search")
async def db_search(
    subject: str | None = None,
    diagram_type: str | None = None,
    tags: str | None = None,
    unit_code: str | None = None,
    limit: int = 2000,
):
    """DB 검색 (unit_code는 prefix 매칭: IS1-02로 검색하면 IS1-02-01 등도 포함)"""
    tag_list = tags.split(",") if tags else None
    results = db_manager.search(
        subject=subject,
        diagram_type=diagram_type,
        query_tags=tag_list,
        unit_code=unit_code,
    )
    return {"count": len(results), "images": results[:limit]}


@app.post("/db/find-similar")
async def find_similar(
    file: UploadFile = File(...),
    threshold: int = Form(40),
):
    """이미지 유사도 검색 (Perceptual Hash)"""
    tmp_dir = tempfile.mkdtemp(prefix="img_match_")
    tmp_file = os.path.join(tmp_dir, file.filename or "query.png")

    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        matches = db_manager.find_duplicates(tmp_file, threshold=threshold)
        return {
            "query": file.filename,
            "matches_count": len(matches),
            "matches": matches[:10],
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ── Phase 2: AI 태깅 ─────────────────────────────────────────


@app.post("/tag")
async def tag_image(
    file: UploadFile = File(...),
):
    """
    단일 이미지를 Claude Sonnet으로 태깅한다.
    긴 변 1024px로 리사이즈 후 전송 (비용 최적화).
    """
    tmp_dir = tempfile.mkdtemp(prefix="img_tag_")
    tmp_file = os.path.join(tmp_dir, file.filename or "image.png")

    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        result = tag_single(tmp_file)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _run_tagging_job(image_paths: list[str], force: bool = False):
    """백그라운드에서 순차 태깅을 실행한다."""
    tagging_status["active"] = True
    tagging_status["phase"] = "running"
    tagging_status["current"] = 0
    tagging_status["total"] = len(image_paths)
    tagging_status["tagged"] = 0
    tagging_status["errors"] = 0

    try:
        for i, path in enumerate(image_paths):
            try:
                result = tag_single(path)
                result["_source_path"] = path

                if "error" not in result:
                    # DB 인덱스에 즉시 반영
                    for img in db_manager.index["images"]:
                        abs_path = str(db_manager.db_root / img["filepath"])
                        if abs_path == path:
                            img["tags"] = result
                            if result.get("unit_code"):
                                img["unit_code"] = result["unit_code"]
                            if result.get("unit_name"):
                                img["unit_name"] = result["unit_name"]
                            tagging_status["tagged"] += 1
                            break
                else:
                    tagging_status["errors"] += 1
                    print(f"[Tag] 오류 ({i+1}/{len(image_paths)}): {result.get('error', '')[:80]}")
            except Exception as e:
                tagging_status["errors"] += 1
                print(f"[Tag] 예외 ({i+1}/{len(image_paths)}): {e}")

            tagging_status["current"] = i + 1

            # 10개마다 인덱스 저장 (중간 저장)
            if (i + 1) % 10 == 0:
                db_manager.save_index()
                print(f"[Tag] 진행: {i+1}/{len(image_paths)} (성공 {tagging_status['tagged']}, 오류 {tagging_status['errors']})")

        db_manager.save_index()
        print(f"[Tag] 완료: {tagging_status['tagged']}/{len(image_paths)} 성공")

    finally:
        tagging_status["active"] = False
        tagging_status["phase"] = "done"


@app.post("/tag/batch")
async def tag_images_batch(
    background_tasks: BackgroundTasks,
    use_batch_api: bool = Form(False),
):
    """
    DB에 태깅되지 않은 이미지를 일괄 태깅한다.
    백그라운드에서 실행, 즉시 응답 반환.
    진행률은 GET /health의 tagging 필드로 확인.
    """
    if tagging_status["active"]:
        return JSONResponse({
            "message": "이미 태깅 작업이 진행 중입니다.",
            "tagging": tagging_status,
        }, status_code=409)

    # 미분류 이미지 찾기
    untagged = [
        img for img in db_manager.index["images"]
        if img.get("tags", {}).get("diagram_type") == "미분류"
    ]

    if not untagged:
        return JSONResponse({"message": "태깅할 이미지가 없습니다.", "count": 0})

    image_paths = []
    for img in untagged:
        abs_path = str(db_manager.db_root / img["filepath"])
        if os.path.exists(abs_path):
            image_paths.append(abs_path)

    if not image_paths:
        return JSONResponse({"message": "파일을 찾을 수 없습니다.", "count": 0})

    if use_batch_api:
        try:
            batch_result = submit_batch(image_paths)
            return JSONResponse({
                "mode": "batch_api",
                "batch_id": batch_result.get("batch_id"),
                "submitted_count": batch_result.get("count", 0),
                "status": batch_result.get("status"),
            })
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)

    # 백그라운드에서 순차 태깅 시작
    background_tasks.add_task(_run_tagging_job, image_paths)

    return JSONResponse({
        "mode": "background",
        "total": len(image_paths),
        "message": f"{len(image_paths)}개 이미지 태깅을 백그라운드에서 시작합니다. GET /health로 진행률을 확인하세요.",
    })


@app.post("/tag/retag-all")
async def retag_all_images(
    background_tasks: BackgroundTasks,
    force: bool = Form(False),
):
    """
    DB의 모든 이미지를 재태깅한다 (백그라운드).
    force=true면 이미 태깅된 것도 포함, false면 미분류만.
    진행률은 GET /health의 tagging 필드로 확인.
    """
    if tagging_status["active"]:
        return JSONResponse({
            "message": "이미 태깅 작업이 진행 중입니다.",
            "tagging": tagging_status,
        }, status_code=409)

    if force:
        targets = db_manager.index["images"]
    else:
        targets = [
            img for img in db_manager.index["images"]
            if img.get("tags", {}).get("diagram_type") in ("미분류", None)
               or not img.get("tags", {}).get("diagram_type")
        ]

    if not targets:
        return JSONResponse({"message": "태깅할 이미지가 없습니다.", "count": 0})

    image_paths = []
    for img in targets:
        abs_path = str(db_manager.db_root / img["filepath"])
        if os.path.exists(abs_path):
            image_paths.append(abs_path)

    if not image_paths:
        return JSONResponse({"message": "파일을 찾을 수 없습니다.", "count": 0})

    # 백그라운드에서 태깅 시작
    background_tasks.add_task(_run_tagging_job, image_paths, force)

    return JSONResponse({
        "mode": "background",
        "force": force,
        "total": len(image_paths),
        "message": f"{len(image_paths)}개 이미지 재태깅을 백그라운드에서 시작합니다.",
    })


@app.get("/tag/status")
async def tag_status():
    """현재 태깅 작업 진행 상태 조회"""
    return JSONResponse(tagging_status)


@app.get("/tag/batch/{batch_id}")
async def get_batch_status(batch_id: str):
    """Batch API 결과 조회 + DB 인덱스에 태그 반영"""
    try:
        results = get_batch_results(batch_id)

        # custom_id에서 원본 경로 역추적하여 DB 업데이트
        updated = 0
        for r in results:
            if "error" not in r:
                # custom_id: "tag-0001-filename" 형식
                custom_id = r.get("_custom_id", "")
                stem = custom_id.split("-", 2)[-1] if "-" in custom_id else ""

                for img in db_manager.index["images"]:
                    if stem and stem in img.get("filename", ""):
                        tag_data = {k: v for k, v in r.items() if not k.startswith("_")}
                        img["tags"] = tag_data
                        if tag_data.get("unit_code"):
                            img["unit_code"] = tag_data["unit_code"]
                        if tag_data.get("unit_name"):
                            img["unit_name"] = tag_data["unit_name"]
                        updated += 1
                        break

        if updated:
            db_manager.save_index()

        return JSONResponse({
            "batch_id": batch_id,
            "results_count": len(results),
            "db_updated": updated,
            "results": results,
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Phase 2: 이미지 매칭 ────────────────────────────────────


@app.post("/match")
async def match_image(
    file: UploadFile = File(...),
    subject: str = Form("math"),
    source_name: str = Form("auto_registered"),
    threshold: int = Form(40),
    auto_register: bool = Form(True),
):
    """
    이미지를 DB에서 pHash로 매칭한다.
    매칭 실패 + auto_register=true면 업스케일 보정 후 DB에 신규 등록.
    """
    tmp_dir = tempfile.mkdtemp(prefix="img_match_")
    tmp_file = os.path.join(tmp_dir, file.filename or "query.png")

    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        if auto_register:
            result = image_matcher.match(
                tmp_file,
                threshold=threshold,
                subject=subject,
                source_name=source_name,
            )
        else:
            # 매칭만 하고 등록 안 함
            matches = db_manager.find_duplicates(tmp_file, threshold=threshold)
            if matches:
                best = matches[0]
                result = {
                    "matched": True,
                    "distance": best["_distance"],
                    "db_image": {k: v for k, v in best.items() if k != "_distance"},
                    "action": "matched",
                }
            else:
                result = {
                    "matched": False,
                    "distance": None,
                    "action": "no_match",
                }

        return JSONResponse(result)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/match/batch")
async def match_images_batch(
    files: list[UploadFile] = File(...),
    subject: str = Form("math"),
    source_name: str = Form("auto_registered"),
    threshold: int = Form(40),
):
    """
    여러 이미지를 일괄 매칭. 미매칭 시 자동 등록.
    """
    tmp_dir = tempfile.mkdtemp(prefix="img_match_batch_")
    results = []

    try:
        image_paths = []
        for f in files:
            tmp_file = os.path.join(tmp_dir, f.filename or f"img_{len(image_paths)}.png")
            content = await f.read()
            with open(tmp_file, "wb") as fh:
                fh.write(content)
            image_paths.append(tmp_file)

        results = image_matcher.match_batch(
            image_paths,
            threshold=threshold,
            subject=subject,
            source_name=source_name,
        )

        matched = sum(1 for r in results if r.get("matched"))
        registered = sum(1 for r in results if r.get("action") == "registered")

        return JSONResponse({
            "total": len(results),
            "matched": matched,
            "registered": registered,
            "results": results,
        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.delete("/db/image/{image_id}")
async def delete_image(image_id: str):
    """DB 인덱스에서 이미지 삭제 + 파일 삭제"""
    found = None
    for i, img in enumerate(db_manager.index["images"]):
        if img["id"] == image_id:
            found = (i, img)
            break

    if not found:
        raise HTTPException(status_code=404, detail="Image not found")

    idx, img = found
    # 파일 삭제
    abs_path = db_manager.db_root / img["filepath"]
    if abs_path.exists():
        abs_path.unlink()

    # 인덱스에서 제거
    db_manager.index["images"].pop(idx)
    db_manager.save_index()

    return {"deleted": image_id, "filename": img["filename"]}


@app.delete("/db/source/{source_name:path}")
async def delete_source(source_name: str):
    """소스(출처)별 이미지 일괄 삭제"""
    to_delete = [img for img in db_manager.index["images"] if img.get("source") == source_name]

    for img in to_delete:
        abs_path = db_manager.db_root / img["filepath"]
        if abs_path.exists():
            abs_path.unlink()

    db_manager.index["images"] = [
        img for img in db_manager.index["images"] if img.get("source") != source_name
    ]
    db_manager.index["sources"] = [
        s for s in db_manager.index["sources"] if s.get("name") != source_name
    ]
    db_manager.save_index()

    # 빈 폴더 정리
    import shutil
    for subj_dir in (db_manager.db_root / "images").iterdir():
        src_dir = subj_dir / source_name
        if src_dir.exists() and not any(src_dir.iterdir()):
            shutil.rmtree(src_dir, ignore_errors=True)

    return {"deleted_source": source_name, "deleted_count": len(to_delete)}


@app.get("/db/image/{filepath:path}")
async def serve_image(filepath: str):
    """로컬 DB 이미지 파일 서빙"""
    from fastapi.responses import FileResponse

    abs_path = db_manager.db_root / filepath
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    content_type = "image/png" if str(abs_path).endswith(".png") else "image/jpeg"
    return FileResponse(str(abs_path), media_type=content_type)


# ── 내부 헬퍼 ──────────────────────────────────────────────


def _extract_hwp(hwp_path: str, output_dir: str, min_size: tuple) -> list[dict]:
    """HWP 이미지 추출 — 수동 파서 실패 시 olefile 폴백"""
    img_dir = os.path.join(output_dir, "extracted")
    file_size = os.path.getsize(hwp_path)
    print(f"[HWP Extract] {os.path.basename(hwp_path)}: {file_size / 1024:.0f}KB")

    # 먼저 olefile로 시도 (더 안정적)
    try:
        from extractors.hwp_extractor import extract_with_olefile
        results = extract_with_olefile(hwp_path, img_dir, min_size=min_size)
        if results:
            return results
        print(f"[HWP Extract] olefile: 0개 → 수동 파서 시도")
    except Exception as e:
        print(f"[HWP Extract] olefile 실패: {e}")

    # 수동 OLE2 파서
    try:
        extractor = HWPImageExtractor(hwp_path)
        return extractor.extract_images(img_dir, min_size=min_size)
    except Exception as e:
        print(f"[HWP Extract] 수동 파서도 실패: {e}")
        return []


def _extract_pdf(pdf_path: str, output_dir: str, min_size: tuple, on_progress=None) -> list[dict]:
    """PDF 이미지 추출 — 임베디드 + 페이지 렌더링 병행, 청크 처리"""
    img_dir = os.path.join(output_dir, "extracted")
    extractor = PDFImageExtractor(pdf_path, img_dir)

    total_pages = extractor.get_page_count()
    print(f"[PDF Extract] 총 {total_pages}페이지 — 10페이지씩 청크 처리")

    # 1단계: 임베디드 이미지 추출 (청크 단위)
    embedded = extractor.extract(min_size=min_size, on_progress=on_progress)

    # 2단계: 페이지 수 대비 임베디드 이미지가 적으면 페이지 렌더링 병행
    embedded_per_page = len(embedded) / max(total_pages, 1)
    if embedded_per_page < 0.3:
        print(f"[PDF Extract] 임베디드 {len(embedded)}개 / {total_pages}페이지 → 페이지 렌더링 병행")
        page_images = extractor.extract_pages_as_images(dpi=200, on_progress=on_progress)
        # 페이지 렌더링 결과에서 도식 영역 자동 크롭
        cropped = _auto_crop_pages(page_images, min_size)
        embedded.extend(cropped)

    return embedded


def _auto_crop_pages(page_images: list[dict], min_size: tuple) -> list[dict]:
    """렌더링된 페이지에서 비백색 영역(도식)을 자동 감지해 크롭"""
    import numpy as np
    from PIL import Image as PILImage

    cropped_results = []

    for page_info in page_images:
        filepath = page_info["filepath"]
        if not os.path.exists(filepath):
            continue

        img = PILImage.open(filepath).convert("RGB")
        arr = np.array(img)

        # 그레이스케일로 변환, 흰색(>240) 아닌 영역 찾기
        gray = np.mean(arr, axis=2)
        mask = gray < 240

        # 비백색 행/열 찾기
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)

        if not np.any(rows) or not np.any(cols):
            continue

        y_min, y_max = np.where(rows)[0][[0, -1]]
        x_min, x_max = np.where(cols)[0][[0, -1]]

        # 패딩 추가
        pad = 20
        y_min = max(0, y_min - pad)
        x_min = max(0, x_min - pad)
        y_max = min(arr.shape[0], y_max + pad)
        x_max = min(arr.shape[1], x_max + pad)

        crop_w = x_max - x_min
        crop_h = y_max - y_min

        # 너무 작거나 페이지 거의 전체면 스킵
        if crop_w < min_size[0] or crop_h < min_size[1]:
            continue
        if crop_w > arr.shape[1] * 0.95 and crop_h > arr.shape[0] * 0.95:
            continue  # 페이지 전체 = 도식이 아님

        cropped = img.crop((x_min, y_min, x_max, y_max))
        crop_filename = f"page{page_info['page']:03d}_crop.png"
        crop_path = os.path.join(os.path.dirname(filepath), crop_filename)
        cropped.save(crop_path, "PNG")

        cropped_results.append({
            "filename": crop_filename,
            "filepath": crop_path,
            "page": page_info["page"],
            "width": crop_w,
            "height": crop_h,
            "format": "png",
        })

    return cropped_results


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8200)
