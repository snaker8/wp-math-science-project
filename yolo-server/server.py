"""
YOLO 수학 시험지 문제 영역 감지 서버
- 수학 시험지 페이지 이미지에서 문제/그래프/표 영역 자동 감지
- FastAPI + ultralytics YOLOv8

Usage:
  pip install -r requirements.txt
  # models/best.pt에 학습된 모델 배치
  uvicorn server:app --host 0.0.0.0 --port 8100
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from PIL import Image
import io
import base64
import os
import time

app = FastAPI(
    title="Math Exam Problem Detector",
    description="YOLO 기반 수학 시험지 문제 영역 감지",
    version="1.0",
)

# CORS 설정 (Next.js 개발 서버 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모델 로드
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "models/best.pt")
CLASS_NAMES = {0: "problem", 1: "graph", 2: "table"}
model = None


@app.on_event("startup")
async def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        model = YOLO(MODEL_PATH)
        print(f"[YOLO] Model loaded: {MODEL_PATH}")
        print(f"[YOLO] Classes: {model.names}")
    else:
        print(f"[YOLO] WARNING: Model not found at {MODEL_PATH}")
        print(f"[YOLO] Server running without model. Train and place best.pt in models/")


@app.get("/health")
async def health():
    """서버 상태 확인"""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_path": MODEL_PATH,
        "class_names": CLASS_NAMES,
    }


@app.post("/detect")
async def detect_problems(
    image: UploadFile = File(None),
    image_base64: str = Form(None),
    confidence: float = Form(0.25),
    page_number: int = Form(1),
):
    """
    수학 시험지 페이지에서 문제 영역 감지

    Args:
        image: 이미지 파일 (multipart upload)
        image_base64: base64 인코딩된 이미지 (data:image/...;base64,... 또는 raw base64)
        confidence: 최소 신뢰도 (기본 0.25)
        page_number: 페이지 번호 (메타데이터용)

    Returns:
        problems: [{x, y, w, h, confidence, class}] — top-left normalized (0-1)
        기존 Next.js 앱의 bbox 규약과 동일 형식
    """
    if model is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Model not loaded. Place best.pt in models/ directory."},
        )

    # 이미지 파싱
    try:
        if image and image.filename:
            img_bytes = await image.read()
            pil_img = Image.open(io.BytesIO(img_bytes))
        elif image_base64:
            b64 = image_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            img_bytes = base64.b64decode(b64)
            pil_img = Image.open(io.BytesIO(img_bytes))
        else:
            return JSONResponse(
                status_code=400,
                content={"error": "Provide image file or image_base64"},
            )
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": f"Failed to parse image: {str(e)}"},
        )

    # YOLO 추론
    start_time = time.time()
    results = model(pil_img, conf=confidence, verbose=False)
    inference_ms = (time.time() - start_time) * 1000

    img_w, img_h = pil_img.size
    detections = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            # YOLO는 xyxy (절대 픽셀) 반환
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = box.conf[0].item()
            cls_id = int(box.cls[0].item())
            cls_name = CLASS_NAMES.get(cls_id, f"class_{cls_id}")

            # top-left normalized (0-1) 변환 — Next.js 앱 규약
            detections.append(
                {
                    "x": round(x1 / img_w, 6),
                    "y": round(y1 / img_h, 6),
                    "w": round((x2 - x1) / img_w, 6),
                    "h": round((y2 - y1) / img_h, 6),
                    "confidence": round(conf, 4),
                    "class": cls_name,
                    "class_id": cls_id,
                }
            )

    # 읽기 순서 정렬: 왼쪽 칼럼 (center-x < 0.5) 먼저, 위→아래
    detections.sort(
        key=lambda p: (0 if p["x"] + p["w"] / 2 < 0.5 else 1, p["y"])
    )

    # problem 클래스만 분리 (기존 detect-problems API와 호환)
    problems = [d for d in detections if d["class"] == "problem"]
    others = [d for d in detections if d["class"] != "problem"]

    return {
        "problems": problems,
        "others": others,  # graph, table 등
        "all": detections,
        "count": len(problems),
        "totalDetections": len(detections),
        "source": "yolo",
        "model": os.path.basename(MODEL_PATH),
        "page_number": page_number,
        "inference_ms": round(inference_ms, 1),
        "image_size": {"width": img_w, "height": img_h},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8100)
