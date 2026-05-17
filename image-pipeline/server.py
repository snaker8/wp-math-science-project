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
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from extractors import HWPImageExtractor, PDFImageExtractor
from enhancer import ImageEnhancer
from db_manager import DiagramDBManager
from matcher import ImageMatcher
from tagger import tag_single, tag_batch, submit_batch, get_batch_results

# ★ YOLO 자동 영역 검출 (선택적 의존성)
#   models/best.pt 가 있으면 자동 로드, 없으면 /detect-problems-yolo 호출 시 503
_yolo_model = None
_yolo_load_error: str | None = None
try:
    from ultralytics import YOLO  # type: ignore
    _yolo_model_path = os.getenv("YOLO_MODEL_PATH", "./models/best.pt")
    if os.path.exists(_yolo_model_path):
        _yolo_model = YOLO(_yolo_model_path)
        print(f"[YOLO] Loaded model: {_yolo_model_path}")
    else:
        _yolo_load_error = f"Model file not found: {_yolo_model_path}"
        print(f"[YOLO] {_yolo_load_error}")
except ImportError as e:
    _yolo_load_error = f"ultralytics not installed: {e}"
    print(f"[YOLO] {_yolo_load_error}")
except Exception as e:
    _yolo_load_error = f"YOLO init error: {e}"
    print(f"[YOLO] {_yolo_load_error}")

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


# ★ 낙서/필기 제거 엔드포인트
@app.post("/clean-handwriting")
async def clean_handwriting(
    file: UploadFile = File(...),
    aggressiveness: float = Form(0.5),
):
    """시험지 이미지에서 손글씨/낙서를 제거하여 OCR 정확도 향상"""
    from handwriting_remover import remove_handwriting
    import tempfile

    # 임시 파일에 저장
    suffix = Path(file.filename or "image.png").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        output_path = tmp_path.replace(suffix, f"_clean{suffix}")
        result = remove_handwriting(tmp_path, output_path, aggressiveness)

        if not result.get("cleaned"):
            raise HTTPException(status_code=400, detail=result.get("error", "처리 실패"))

        # 결과 이미지를 base64로 반환
        import base64
        with open(output_path, "rb") as f:
            img_base64 = base64.b64encode(f.read()).decode()

        return {
            **result,
            "image_base64": img_base64,
            "content_type": file.content_type or "image/png",
        }
    finally:
        # 임시 파일 정리
        for p in [tmp_path, tmp_path.replace(suffix, f"_clean{suffix}")]:
            if os.path.exists(p):
                os.remove(p)


@app.post("/clean-pdf")
async def clean_pdf_handwriting(
    file: UploadFile = File(...),
    aggressiveness: float = Form(0.5),
):
    """PDF의 각 페이지에서 손글씨/낙서를 제거한 PDF 반환"""
    import fitz  # PyMuPDF
    from handwriting_remover import remove_handwriting
    import tempfile
    import base64

    content = await file.read()
    doc = fitz.open(stream=content, filetype="pdf")

    cleaned_pages = 0
    total_removed = 0.0

    for page_num in range(len(doc)):
        page = doc[page_num]
        # 페이지를 이미지로 렌더링 (300 DPI)
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            pix.save(tmp.name)
            tmp_path = tmp.name

        try:
            out_path = tmp_path.replace('.png', '_clean.png')
            result = remove_handwriting(tmp_path, out_path, aggressiveness)

            if result.get("cleaned") and result.get("removed_ratio", 0) > 0.001:
                # 정리된 이미지로 페이지 교체
                clean_pix = fitz.Pixmap(out_path)
                page.clean_contents()
                # 페이지를 빈 페이지로 만들고 정리된 이미지 삽입
                page_rect = page.rect
                page.insert_image(page_rect, pixmap=clean_pix)
                cleaned_pages += 1
                total_removed += result.get("removed_ratio", 0)
        finally:
            for p in [tmp_path, tmp_path.replace('.png', '_clean.png')]:
                if os.path.exists(p):
                    os.remove(p)

    # 정리된 PDF를 바이트로 반환
    pdf_bytes = doc.tobytes()
    doc.close()

    return {
        "cleaned": cleaned_pages > 0,
        "total_pages": len(doc) if hasattr(doc, '__len__') else 0,
        "cleaned_pages": cleaned_pages,
        "avg_removed_ratio": round(total_removed / max(cleaned_pages, 1), 4),
        "pdf_base64": base64.b64encode(pdf_bytes).decode(),
    }


@app.post("/clean-pdf-base64")
async def clean_pdf_base64(req: dict):
    """base64 PDF로 낙서 제거 (Next.js 호환)"""
    import fitz
    from handwriting_remover import remove_handwriting
    import tempfile
    import base64

    pdf_base64 = req.get("pdf_base64", "")
    aggressiveness = req.get("aggressiveness", 0.5)

    if not pdf_base64:
        raise HTTPException(status_code=400, detail="pdf_base64 필요")

    pdf_bytes = base64.b64decode(pdf_base64)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    cleaned_pages = 0
    total_removed = 0.0

    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            pix.save(tmp.name)
            tmp_path = tmp.name

        try:
            out_path = tmp_path.replace('.png', '_clean.png')
            result = remove_handwriting(tmp_path, out_path, aggressiveness)

            if result.get("cleaned") and result.get("removed_ratio", 0) > 0.001:
                clean_pix = fitz.Pixmap(out_path)
                page.clean_contents()
                page_rect = page.rect
                page.insert_image(page_rect, pixmap=clean_pix)
                cleaned_pages += 1
                total_removed += result.get("removed_ratio", 0)
        finally:
            for p in [tmp_path, tmp_path.replace('.png', '_clean.png')]:
                if os.path.exists(p):
                    os.remove(p)

    out_pdf = doc.tobytes()
    total_pages = len(doc)
    doc.close()

    return {
        "cleaned": cleaned_pages > 0,
        "cleaned_pages": cleaned_pages,
        "total_pages": total_pages,
        "avg_removed_ratio": round(total_removed / max(cleaned_pages, 1), 4),
        "pdf_base64": base64.b64encode(out_pdf).decode(),
    }


# ============================================================================
# /detect-figures-cv — PDF/이미지 각 페이지에서 그림 bbox 자동 검출 (OpenCV)
# ============================================================================
# Gemini 의 bbox 환각 사고 우회.
# 깨끗한 시험지 (캡쳐본/스캔) 에서 OpenCV connected components + 텍스트 필터링
# 으로 그림·실험장치·그래프 영역 자동 검출. 학습 필요 X, 무료, <100ms/페이지.
#
# 결과: 페이지 정규화 좌표 + 크롭 PNG base64 (Sharp 업스케일 같이 적용).

def _merge_nearby_bboxes(boxes, max_gap=30):
    """가까운 bbox 들 union-find 로 묶기."""
    if not boxes:
        return []
    n = len(boxes)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    def near(b1, b2, gap):
        x1, y1, w1, h1 = b1
        x2, y2, w2, h2 = b2
        return not (x1 + w1 + gap < x2 or x2 + w2 + gap < x1 or
                    y1 + h1 + gap < y2 or y2 + h2 + gap < y1)

    for i in range(n):
        for j in range(i + 1, n):
            if near(boxes[i], boxes[j], max_gap):
                union(i, j)

    groups = {}
    for i in range(n):
        r = find(i)
        groups.setdefault(r, []).append(boxes[i])

    merged = []
    for grp in groups.values():
        x0 = min(b[0] for b in grp)
        y0 = min(b[1] for b in grp)
        x1 = max(b[0] + b[2] for b in grp)
        y1 = max(b[1] + b[3] for b in grp)
        merged.append((x0, y0, x1 - x0, y1 - y0))
    return merged


def _detect_figures_in_page_image(pil_img, strict_filter=True):
    """
    한 페이지 PIL 이미지에서 그림 bbox 검출 (v2 — 사용자 피드백 반영).

    v1 사고 두 가지:
      1) "과학영역", "제3교시" 같은 박스형 헤더 텍스트가 figure 로 잡힘
      2) (가)/(나) 도형 한 쌍에서 한쪽만 잡히거나 라벨이 잘림 (gap 30px 부족)

    v2 알고리즘:
      A. 적응형 이진화
      B. **공격적 dilation** — 큰 kernel 로 그림 부분들을 미리 한 덩어리로 묶음
      C. dilated 이미지에서 connected components 분석
      D. 각 후보 bbox 안 내용물 검사:
         - 큰 CC (>=TEXT_MAX) 1개 이상 있어야 figure (없으면 텍스트 박스 = 헤더 등)
         - 너무 wide-thin (aspect>8) 은 헤더 띠로 간주 제외
         - 페이지 최상단 5% 안 짧은 박스는 헤더로 간주 제외

    Returns: list of {x, y, w, h} (페이지 정규화 0~1)
    """
    import cv2
    import numpy as np

    img = np.array(pil_img.convert('RGB'))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    H, W = gray.shape

    # 적응형 이진화
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35, 15,
    )

    # ★ 핵심 — 비등방 dilation 으로 figure 부분들 미리 합치기
    #   (가)/(나) 처럼 가로로 떨어진 도형 한 쌍을 한 덩어리로 묶기 위해
    #   가로 방향을 훨씬 공격적으로 — kernel 40×15 + iterations 2 → 가로 ~160px / 세로 ~60px
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 15))
    dilated = cv2.dilate(binary, kernel, iterations=2)

    # dilated 위에서 connected components
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(dilated, connectivity=8)

    # 한글 글자 60-70px (300 DPI 기준 ascender + descender 포함)
    TEXT_MAX = 70

    figures = []
    for i in range(1, num_labels):
        x, y, w, h, area = stats[i]
        x, y, w, h = int(x), int(y), int(w), int(h)

        # === 크기 필터 ===
        # strict (페이지 통째): 헤더 띠 거르려고 큰 임계값 — w≥120, h≥80
        # lenient (문제 crop 안): 작은 figure 보호 — w≥80, h≥40
        #   ex) 양성자/중성자 단일 row 점 모음 figure 가 lenient 임계값으로 통과
        min_w = 120 if strict_filter else 80
        min_h = 80 if strict_filter else 40
        min_area = 12000 if strict_filter else 5000
        if w < min_w or h < min_h:
            continue
        if w * h < min_area:
            continue
        # ★ 면적 비율 상한 — bbox 가 입력의 60% 이상이면 "본문 통째로" 잡힌 케이스 (#4 사고)
        #    문제 안 figure 는 보통 절반 이하. 이 필터는 strict/lenient 모두 적용.
        area_ratio = (w * h) / max(1, W * H)
        if area_ratio > 0.60:
            continue
        # 거의 페이지 전체 (오검출)
        if w > W * 0.95 and h > H * 0.90:
            continue

        # === 위치 필터: 최상단 헤더 띠 제외 ===
        #   상단 7% 안에 위치 + 높이 짧으면 헤더로 간주 (시험지 제목·교시 등)
        if y < H * 0.07 and h < 120:
            continue

        # === 종횡비 필터: 가로로 매우 긴 띠는 보통 헤더/구분선 ===
        aspect = w / h if h > 0 else 99
        if aspect > 8:
            continue
        # 세로로 매우 긴 띠도 figure 아님 (테이블 컬럼 등)
        if h / max(1, w) > 6:
            continue

        # === 내용물 검사 (원본 이진화 ROI 사용, dilated 아님) ===
        orig_roi = binary[y:y+h, x:x+w]
        n_inside, _, stats_inside, _ = cv2.connectedComponentsWithStats(orig_roi, connectivity=8)

        large_cc_count = 0
        text_cc_count = 0
        max_inner_dim = 0
        for j in range(1, n_inside):
            iw = int(stats_inside[j, cv2.CC_STAT_WIDTH])
            ih = int(stats_inside[j, cv2.CC_STAT_HEIGHT])
            if iw < TEXT_MAX and ih < TEXT_MAX:
                text_cc_count += 1
            else:
                large_cc_count += 1
                max_inner_dim = max(max_inner_dim, max(iw, ih))

        # ★ strict 모드 — 페이지 통째 호출 시 헤더/표지 텍스트 박스 거름
        if strict_filter:
            if large_cc_count == 0:
                continue
            if text_cc_count >= 30 and large_cc_count <= 2:
                continue
            if max_inner_dim < 80:
                continue
        else:
            # ★ lenient 모드 (문제 crop 안 호출) — strict 보다 느슨하지만
            #   "본문 통째 텍스트 / <보기> 박스 / 라벨 박스" 같은 명백한 텍스트 영역은 거름.
            #   #4·#7 사고에서 확인된 케이스 차단.
            #
            #   ★ 작은 점·원 모임 (양성자/중성자, 전자 이동도) 같은 figure 보호:
            #     max_inner_dim 임계값을 60→40 으로 낮춤. 텍스트 한글 글자는 보통 30-40px 라
            #     40 임계값으로도 단일 글자 라벨은 거르고 점 모음 figure 는 통과.
            #     추가로 CC 수를 봄 — figure 안엔 보통 많은 CC 가 있고, 텍스트 박스도 마찬가지라
            #     단일 잣대로 충분치 않음. text_cc / total_cc 비율 + 큰 CC 절대 수 조합으로 판정.

            # 1) 큰 CC 가 하나도 없으면 텍스트 박스 — 제외 (strict 와 동일)
            if large_cc_count == 0:
                continue
            # 2) 가장 큰 내부 stroke 40px 미만 → 라벨 텍스트만 (figure 아님)
            #    완화: 40 = 한글 글자 평균 크기. 점·원 figure 는 통과, 단일 글자만은 거름.
            if max_inner_dim < 40:
                continue
            # ★ 이전 v3 의 "text_cc≥50 AND large_cc≤2 → 거름" 필터는 제거.
            #   양성자/중성자 점 모음, 전자 이동도 같은 dot-figure 가 작은 원 ~50개+
            #   가지런해서 위 패턴에 걸려 손실되던 사고 (#12, #24).
            #   대신 area_ratio < 0.60 (위 위 단계) 가 본문 통째 케이스 차단 — 충분.
            #   <보기> 텍스트 박스 일부가 figure 로 잡힐 수 있지만 사용자 명시 정책 부합.

        figures.append({
            "x": float(x) / W,
            "y": float(y) / H,
            "w": float(w) / W,
            "h": float(h) / H,
        })

    # === 후처리: 선택지 그리드 패턴 제거 ===
    #   3+ 비슷한 크기의 figure 가 가로로 줄지어 있으면 선택지 그리드 (예: "A 노란색", "B 자홍색", "A 노란색" ...)
    #   → 진짜 그림 아님, 제외
    figures = _suppress_choice_grids(figures)

    return figures


def _suppress_choice_grids(figures):
    """
    선택지 그리드 패턴 제거:
      - 3+ 의 figure 가 비슷한 y 좌표 (4% 이내) AND 비슷한 height (1.5배 이내) 면
        선택지 옵션 행으로 간주 → 모두 제거.
      - 단, 각 figure 가 페이지 width 의 25% 이상 차지하면 큰 figure 일 가능성 ↑ → 유지.
    """
    if len(figures) < 3:
        return figures

    used = set()
    keep = []

    for i in range(len(figures)):
        if i in used:
            continue
        fi = figures[i]
        row = [i]
        for j in range(i + 1, len(figures)):
            if j in used:
                continue
            fj = figures[j]
            y_diff = abs(fj["y"] - fi["y"])
            h_max = max(fj["h"], fi["h"])
            h_min = max(0.001, min(fj["h"], fi["h"]))
            h_ratio = h_max / h_min
            if y_diff < 0.04 and h_ratio < 1.5:
                row.append(j)

        if len(row) >= 3:
            # 선택지 그리드 후보 — 각 figure 가 충분히 크면 (페이지 width 25% 이상) 유지
            all_large = all(figures[k]["w"] >= 0.25 for k in row)
            if all_large:
                # 큰 multi-panel figure 들 → 유지
                for k in row:
                    used.add(k)
                    keep.append(figures[k])
            else:
                # 작은 옵션 그리드 → 제거
                for k in row:
                    used.add(k)
        else:
            for k in row:
                used.add(k)
                keep.append(figures[k])

    return keep


@app.post("/detect-figures-cv")
async def detect_figures_cv(req: dict):
    """
    Body:
      file_base64: str         — PDF 또는 이미지 base64 (data: prefix 허용)
      mime_type: str
      dpi: int = 300
      include_crops: bool = True   — true 면 figure 별 crop PNG 도 base64 로 함께 반환

    Returns:
      success: bool
      page_count: int
      pages: [{
        page_idx, width, height,
        figures: [{x, y, w, h, crop_base64?}]
      }]
    """
    import fitz
    import base64
    import io
    from PIL import Image

    file_base64 = req.get("file_base64", "")
    mime_type = req.get("mime_type", "")
    dpi = int(req.get("dpi", 300))
    include_crops = bool(req.get("include_crops", True))
    # strict_filter=True: 텍스트만 든 박스 거름 (whole-page 호출용, 헤더 노이즈 제거)
    # strict_filter=False: <보기> 같은 텍스트 박스도 보존 (문제 crop 안 호출용)
    strict_filter = bool(req.get("strict_filter", True))

    if not file_base64:
        raise HTTPException(status_code=400, detail="file_base64 필요")
    if "," in file_base64:
        file_base64 = file_base64.split(",", 1)[1]
    missing_padding = len(file_base64) % 4
    if missing_padding:
        file_base64 += "=" * (4 - missing_padding)

    raw = base64.b64decode(file_base64)
    is_pdf = "pdf" in mime_type.lower() or file_base64[:5].startswith("JVBER")

    page_images = []
    if is_pdf:
        doc = fitz.open(stream=raw, filetype="pdf")
        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        for idx in range(len(doc)):
            page = doc[idx]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            page_images.append((idx, img))
        doc.close()
    else:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        page_images.append((0, img))

    pages_result = []
    for (page_idx, pil_img) in page_images:
        W, H = pil_img.size
        figures = _detect_figures_in_page_image(pil_img, strict_filter=strict_filter)

        # 크롭 PNG 함께 반환
        if include_crops:
            for fig in figures:
                left = int(fig["x"] * W)
                top = int(fig["y"] * H)
                right = int((fig["x"] + fig["w"]) * W)
                bottom = int((fig["y"] + fig["h"]) * H)
                # padding 10px
                pad = 10
                left = max(0, left - pad)
                top = max(0, top - pad)
                right = min(W, right + pad)
                bottom = min(H, bottom + pad)
                crop = pil_img.crop((left, top, right, bottom))
                buf = io.BytesIO()
                crop.save(buf, format="PNG", optimize=True)
                fig["crop_base64"] = base64.b64encode(buf.getvalue()).decode()
                fig["crop_width"] = crop.width
                fig["crop_height"] = crop.height

        pages_result.append({
            "page_idx": page_idx,
            "width": W,
            "height": H,
            "figures": figures,
        })

    return {
        "success": True,
        "page_count": len(page_images),
        "pages": pages_result,
    }


# ============================================================================
# /render-pdf-pages — PDF 전체 페이지를 base64 PNG 배열로 렌더
# ============================================================================
# 과학 자산화 per-problem 흐름용. 페이지별 PNG 를 한 번에 받아서 클라이언트가
# 각 페이지를 YOLO 에 던지고, 각 문제 crop 을 Gemini 에 던지는 데 사용.
@app.post("/render-pdf-pages")
async def render_pdf_pages(req: dict):
    """
    Body:
      file_base64: str   — PDF base64 (data: prefix 허용)
      dpi: int = 300     — 렌더 DPI (300=A4 약 2480x3508 px)

    Returns:
      success: bool
      page_count: int
      pages: [{ page_idx, width, height, image_base64 }]
    """
    import fitz
    import base64
    import io
    from PIL import Image

    file_base64 = req.get("file_base64", "")
    dpi = int(req.get("dpi", 300))

    if not file_base64:
        raise HTTPException(status_code=400, detail="file_base64 필요")

    if "," in file_base64:
        file_base64 = file_base64.split(",", 1)[1]
    missing_padding = len(file_base64) % 4
    if missing_padding:
        file_base64 += "=" * (4 - missing_padding)

    pdf_bytes = base64.b64decode(file_base64)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    scale = dpi / 72.0
    mat = fitz.Matrix(scale, scale)

    pages = []
    for idx in range(page_count):
        page = doc[idx]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        out_buf = io.BytesIO()
        img.save(out_buf, format="PNG", optimize=True)
        page_b64 = base64.b64encode(out_buf.getvalue()).decode()
        pages.append({
            "page_idx": idx,
            "width": pix.width,
            "height": pix.height,
            "image_base64": page_b64,
        })

    doc.close()

    return {
        "success": True,
        "page_count": page_count,
        "pages": pages,
    }


# ============================================================================
# /crop-figure — PDF/이미지 + 정규화 bbox → 잘라낸 PNG (base64)
# ============================================================================
# 과학 자산화 Gemini POC 용. Gemini Vision 이 반환한 figures bbox 좌표(0~1)로
# 페이지를 렌더링한 뒤 크롭. PDF 는 PyMuPDF 로 page_idx 페이지를 dpi 해상도로
# 렌더, 이미지는 그대로 사용.
@app.post("/crop-figure")
async def crop_figure(req: dict):
    """
    Body:
      file_base64: str        — PDF 또는 이미지 base64 (data: prefix 허용)
      mime_type: str           — 'application/pdf' or 'image/jpeg' etc.
      page_idx: int = 0        — PDF 페이지 인덱스 (0-based). 이미지는 무시.
      x, y, w, h: float        — 정규화 좌표 (0.0~1.0). 좌상단 기준.
      dpi: int = 400           — PDF 렌더 DPI. 400 이면 A4 약 3300x4700 px.
      padding: float = 0.01    — bbox 주변 여유 (정규화). 글자 라벨 잘림 방지.

    Returns:
      success: bool
      image_base64: str        — 크롭된 PNG (raw base64, no prefix)
      width: int               — 크롭 픽셀 너비
      height: int              — 크롭 픽셀 높이
      page_count: int          — PDF 총 페이지 수 (이미지면 1)
    """
    import fitz
    import base64
    import io
    from PIL import Image

    file_base64 = req.get("file_base64", "")
    mime_type = req.get("mime_type", "")
    page_idx = int(req.get("page_idx", 0))
    x = float(req.get("x", 0))
    y = float(req.get("y", 0))
    w = float(req.get("w", 1))
    h = float(req.get("h", 1))
    dpi = int(req.get("dpi", 400))
    padding = float(req.get("padding", 0.01))

    if not file_base64:
        raise HTTPException(status_code=400, detail="file_base64 필요")

    # data: prefix 제거
    if "," in file_base64:
        file_base64 = file_base64.split(",", 1)[1]
    # base64 패딩 보정
    missing_padding = len(file_base64) % 4
    if missing_padding:
        file_base64 += "=" * (4 - missing_padding)

    raw_bytes = base64.b64decode(file_base64)

    # bbox 정규화 + padding (0~1 범위 클램프)
    px = max(0.0, x - padding)
    py = max(0.0, y - padding)
    pw = min(1.0 - px, w + 2 * padding)
    ph = min(1.0 - py, h + 2 * padding)

    is_pdf = "pdf" in mime_type.lower() or file_base64[:5] in ("JVBER", "JVBER")

    if is_pdf:
        # PDF 페이지 렌더 + 크롭
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
        page_count = len(doc)
        if page_idx >= page_count or page_idx < 0:
            doc.close()
            raise HTTPException(status_code=400, detail=f"page_idx={page_idx} 범위 초과 (총 {page_count}p)")

        page = doc[page_idx]
        # dpi → matrix scale (PDF 는 기본 72 dpi)
        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
    else:
        # 이미지: 그대로 PIL 로 열기
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        page_count = 1

    img_w, img_h = img.size
    crop_box = (
        int(px * img_w),
        int(py * img_h),
        int((px + pw) * img_w),
        int((py + ph) * img_h),
    )
    cropped = img.crop(crop_box)

    out_buf = io.BytesIO()
    cropped.save(out_buf, format="PNG", optimize=True)
    out_base64 = base64.b64encode(out_buf.getvalue()).decode()

    return {
        "success": True,
        "image_base64": out_base64,
        "width": cropped.width,
        "height": cropped.height,
        "page_count": page_count,
    }


@app.post("/clean-handwriting-base64")
async def clean_handwriting_base64(req: dict):
    """base64 이미지로 낙서 제거 (Next.js 호환)"""
    from handwriting_remover import remove_handwriting
    import tempfile
    import base64

    image_base64 = req.get("image_base64", "")
    aggressiveness = req.get("aggressiveness", 0.5)

    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 필요")

    # data:image/...;base64, 프리픽스 제거
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]

    # base64 패딩 보정
    missing_padding = len(image_base64) % 4
    if missing_padding:
        image_base64 += "=" * (4 - missing_padding)

    img_bytes = base64.b64decode(image_base64)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
        tmp.write(img_bytes)
        tmp_path = tmp.name

    try:
        output_path = tmp_path.replace('.png', '_clean.png')
        result = remove_handwriting(tmp_path, output_path, aggressiveness)

        if not result.get("cleaned"):
            raise HTTPException(status_code=400, detail=result.get("error", "처리 실패"))

        with open(output_path, "rb") as f:
            out_base64 = base64.b64encode(f.read()).decode()

        return {
            **result,
            "image_base64": out_base64,
        }
    finally:
        for p in [tmp_path, tmp_path.replace('.png', '_clean.png')]:
            if os.path.exists(p):
                os.remove(p)


@app.post("/clean-handwriting-local")
async def clean_handwriting_local(req: dict):
    """로컬 파일 경로로 낙서 제거"""
    from handwriting_remover import clean_exam_image

    file_path = req.get("file_path", "")
    output_path = req.get("output_path", None)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"파일을 찾을 수 없습니다: {file_path}")

    result = clean_exam_image(file_path, output_path)
    return result


class ExtractLocalRequest(BaseModel):
    """로컬 파일 경로로 추출 요청 (대용량 파일 HTTP 전송 우회)"""
    file_path: str
    file_name: str = ""
    subject: str = "math"
    source_name: str = ""
    science_subject: str = ""
    enhance: bool = True
    upload_to_supabase: bool = False
    auto_tag: bool = True
    min_width: int = 200
    min_height: int = 200


@app.post("/extract-local")
async def extract_images_local(req: ExtractLocalRequest):
    """로컬 파일 경로를 받아 이미지 추출 (HTTP 파일 업로드 없이)"""
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail=f"파일 없음: {req.file_path}")

    # UploadFile 대신 로컬 파일을 직접 사용하도록 가짜 File 객체 구성
    class _LocalFile:
        def __init__(self, path, name):
            self.filename = name or Path(path).name
        async def read(self):
            with open(req.file_path, "rb") as f:
                return f.read()

    file_name = req.file_name or Path(req.file_path).name
    fake_file = _LocalFile(req.file_path, file_name)

    return await extract_images(
        file=fake_file,
        subject=req.subject,
        source_name=req.source_name,
        science_subject=req.science_subject,
        enhance=req.enhance,
        upload_to_supabase=req.upload_to_supabase,
        auto_tag=req.auto_tag,
        min_width=req.min_width,
        min_height=req.min_height,
    )


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
    if not source_name or source_name in ("null", "undefined", "None"):
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

        # ★ 쓰레기 이미지 필터링 (배경/그라데이션/장식 자동 제거)
        processing_status["phase"] = "filtering"
        filtered = []
        trash_count = 0
        for item in extracted:
            img_path = item.get("enhanced_path") or item["filepath"]
            if _is_trash_image(img_path):
                trash_count += 1
                # 쓰레기 파일 삭제
                for p in [item.get("enhanced_path"), item["filepath"]]:
                    if p and os.path.exists(p):
                        try: os.remove(p)
                        except: pass
            else:
                filtered.append(item)
        if trash_count > 0:
            print(f"[Extract] {source_name}: 쓰레기 이미지 {trash_count}개 제거, {len(filtered)}개 유지")
        extracted = filtered

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

        # ★ AI 태깅 (백그라운드에서 비동기 실행 — 추출 응답은 즉시 반환)
        tagged_count = 0
        if auto_tag and db_entries:
            tag_paths = []
            for entry in db_entries:
                abs_path = str(db_manager.db_root / entry["filepath"])
                if os.path.exists(abs_path):
                    tag_paths.append(abs_path)
            if tag_paths:
                import threading
                def _bg_tag(paths, src_name):
                    try:
                        print(f"[Extract] {src_name}: 백그라운드 AI 태깅 시작 ({len(paths)}개)...")
                        results = tag_batch(paths)
                        path_to_result = {r["_source_path"]: r for r in results if "error" not in r}
                        count = 0
                        for img in db_manager.index["images"]:
                            ap = str(db_manager.db_root / img["filepath"])
                            if ap in path_to_result:
                                result = path_to_result[ap]
                                img["tags"] = result
                                if result.get("unit_code"): img["unit_code"] = result["unit_code"]
                                if result.get("unit_name"): img["unit_name"] = result["unit_name"]
                                count += 1
                        # 배경/장식 자동 제거
                        trash_types = {"배경", "장식", "로고", "표지", "워터마크", "빈이미지", "그라데이션"}
                        removed = 0
                        for img in list(db_manager.index["images"]):
                            dt = (img.get("tags") or {}).get("diagram_type", "")
                            if dt in trash_types:
                                ap = str(db_manager.db_root / img["filepath"])
                                if os.path.exists(ap):
                                    try: os.remove(ap)
                                    except: pass
                                db_manager.index["images"].remove(img)
                                removed += 1
                        db_manager.save_index()
                        print(f"[Extract] {src_name}: 백그라운드 태깅 완료 ({count}개 태깅, {removed}개 제거)")
                    except Exception as e:
                        print(f"[Extract] {src_name}: 백그라운드 태깅 오류 — {e}")
                threading.Thread(target=_bg_tag, args=(tag_paths, source_name), daemon=True).start()
                print(f"[Extract] {source_name}: 태깅 {len(tag_paths)}개 백그라운드 시작")

        # (기존 동기 태깅 제거 — 위에서 백그라운드 스레드로 대체)

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

    except HTTPException:
        processing_status["active"] = False
        processing_status["phase"] = "error"
        raise
    except Exception as e:
        processing_status["active"] = False
        processing_status["phase"] = "error"
        print(f"[Extract] 추출 중 오류: {e}")
        raise HTTPException(status_code=500, detail=f"추출 오류: {str(e)}")
    finally:
        # 임시 파일 정리 (DB에 복사된 후)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


@app.post("/detect-problems-yolo")
async def detect_problems_yolo(
    file: UploadFile = File(...),
    imgsz: int = Form(1024),
    conf: float = Form(0.25),
):
    """
    YOLO 자동 문제 영역 검출.
    이미지 1장 → bbox 리스트 (0~1 정규화 좌표).

    응답:
      {
        "ok": true,
        "imageWidth": 1190,
        "imageHeight": 1682,
        "detections": [
          { "x": 0.05, "y": 0.28, "w": 0.43, "h": 0.10, "conf": 0.95, "classLabel": "problem" }
        ]
      }
    """
    if _yolo_model is None:
        raise HTTPException(
            status_code=503,
            detail=f"YOLO model not loaded. {_yolo_load_error or 'unknown error'}",
        )

    tmp_dir = tempfile.mkdtemp(prefix="yolo_detect_")
    tmp_file = os.path.join(tmp_dir, file.filename or "image.png")
    try:
        content = await file.read()
        with open(tmp_file, "wb") as f:
            f.write(content)

        # PIL 로 원본 크기 읽기 (응답에 포함 — 클라이언트가 좌표 변환 시 사용)
        from PIL import Image as PILImage
        with PILImage.open(tmp_file) as im:
            w0, h0 = im.size

        results = _yolo_model.predict(tmp_file, imgsz=imgsz, conf=conf, verbose=False)
        boxes = results[0].boxes
        names = results[0].names  # {0: 'problem', ...}

        detections = []
        if boxes is not None and len(boxes) > 0:
            # xywhn: 정규화 (0~1) 중심좌표+w/h
            xywhn = boxes.xywhn.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
            cls_ids = boxes.cls.cpu().numpy().astype(int)
            for i in range(len(boxes)):
                cx, cy, bw, bh = xywhn[i]
                # YOLO 중심 좌표 → 좌상단 좌표 (우리 detection_annotations 형식과 동일)
                x = float(cx) - float(bw) / 2.0
                y = float(cy) - float(bh) / 2.0
                detections.append({
                    "x": max(0.0, x),
                    "y": max(0.0, y),
                    "w": float(bw),
                    "h": float(bh),
                    "conf": float(confs[i]),
                    "classLabel": names.get(int(cls_ids[i]), "problem"),
                })

        return {
            "ok": True,
            "imageWidth": int(w0),
            "imageHeight": int(h0),
            "modelPath": _yolo_model_path if _yolo_model is not None else None,
            "detections": detections,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YOLO inference error: {e}")
    finally:
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


def _is_trash_image(image_path: str) -> bool:
    """배경/그라데이션/장식 이미지인지 판별 (색상 분산 + 엣지 비율)"""
    try:
        from PIL import Image
        import numpy as np
        im = Image.open(image_path).convert("RGB")
        arr = np.array(im, dtype=np.float32)

        # 색상 표준편차 — 배경/그라데이션은 낮음
        std = arr.std()

        # 엣지 비율 — 실제 도식은 선/텍스트가 있어 엣지가 많음
        gray = arr.mean(axis=2)
        dx = np.abs(np.diff(gray, axis=1))
        dy = np.abs(np.diff(gray, axis=0))
        edge_ratio = (np.sum(dx > 20) + np.sum(dy > 20)) / gray.size

        # 지배적 색상 비율 — 단색이면 쓰레기
        dominant_pct = 0.0
        for ch in range(3):
            vals, counts = np.unique((arr[:, :, ch] / 16).astype(int), return_counts=True)
            dominant_pct = max(dominant_pct, float(counts.max()) / float(counts.sum()))

        is_trash = (std < 25 and edge_ratio < 0.02) or (dominant_pct > 0.85 and edge_ratio < 0.03)
        return is_trash
    except Exception:
        return False


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8200)
