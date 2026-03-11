"""
EVPM (Enhanced Visual Prompt Markup) — 이미지 주석 모듈
수학 그래프/도형 이미지에 시각적 주석(격자, 라벨, 하이라이트)을 오버레이하여
VLM(Vision Language Model)의 인식 정확도를 향상시킨다.

Microsoft Set-of-Mark (SoM) 기법에서 영감을 받은 접근.

Usage:
    from annotator import annotate_image, create_math_graph_preset

    # 1. 수동 주석 리스트
    annotations = [
        {"type": "grid", "spacing": 40, "color": [200, 200, 200], "alpha": 0.3},
        {"type": "label", "text": "A", "x": 0.5, "y": 0.3, "color": [255, 0, 0]},
        {"type": "highlight", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "color": [0, 255, 0], "alpha": 0.2},
    ]
    result = annotate_image(image_bytes, annotations)

    # 2. 수학 그래프 프리셋
    annotations = create_math_graph_preset()
    result = annotate_image(image_bytes, annotations)
"""

import io
import math
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ============================================================================
# 주석 타입별 렌더러
# ============================================================================

def _draw_grid(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """격자선 오버레이 (수학 좌표 평면 힌트)"""
    w, h = img.size
    spacing = ann.get("spacing", 40)  # 픽셀 간격
    color = tuple(ann.get("color", [180, 180, 180]))
    alpha = ann.get("alpha", 0.25)

    # 반투명 격자 → RGBA overlay
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    line_alpha = int(255 * alpha)
    rgba_color = color + (line_alpha,)

    # 세로선
    for x in range(0, w, spacing):
        odraw.line([(x, 0), (x, h)], fill=rgba_color, width=1)
    # 가로선
    for y in range(0, h, spacing):
        odraw.line([(0, y), (w, y)], fill=rgba_color, width=1)

    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def _draw_axes(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """x/y 축 강조선 오버레이 (이미지 중앙 기준)"""
    w, h = img.size
    color = tuple(ann.get("color", [255, 50, 50]))
    thickness = ann.get("thickness", 2)
    # 중심점 (사용자 지정 또는 이미지 중앙)
    cx = int(ann.get("cx", 0.5) * w)
    cy = int(ann.get("cy", 0.5) * h)

    # x축 (가로)
    draw.line([(0, cy), (w, cy)], fill=color, width=thickness)
    # y축 (세로)
    draw.line([(cx, 0), (cx, h)], fill=color, width=thickness)


def _draw_ticks(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """축 눈금 표시"""
    w, h = img.size
    color = tuple(ann.get("color", [100, 100, 100]))
    tick_len = ann.get("tick_length", 6)
    spacing = ann.get("spacing", 40)
    cx = int(ann.get("cx", 0.5) * w)
    cy = int(ann.get("cy", 0.5) * h)

    # x축 눈금
    for x in range(0, w, spacing):
        draw.line([(x, cy - tick_len), (x, cy + tick_len)], fill=color, width=1)
    # y축 눈금
    for y in range(0, h, spacing):
        draw.line([(cx - tick_len, y), (cx + tick_len, y)], fill=color, width=1)


def _draw_label(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """텍스트 라벨 (번호/문자 태그)"""
    w, h = img.size
    text = str(ann.get("text", "?"))
    x = int(ann.get("x", 0.5) * w)
    y = int(ann.get("y", 0.5) * h)
    color = tuple(ann.get("color", [255, 0, 0]))
    font_size = ann.get("font_size", 16)
    bg_color = tuple(ann.get("bg_color", [255, 255, 255]))
    bg_alpha = ann.get("bg_alpha", 0.85)

    # 폰트
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # 텍스트 크기 계산
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    padding = 4

    # 배경 박스 (반투명)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    bg_rgba = bg_color + (int(255 * bg_alpha),)
    odraw.rounded_rectangle(
        [x - padding, y - padding, x + tw + padding, y + th + padding],
        radius=4,
        fill=bg_rgba,
    )
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))

    # 텍스트 그리기
    draw.text((x, y), text, fill=color, font=font)


def _draw_highlight(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """영역 하이라이트 (반투명 박스)"""
    w, h = img.size
    bx = int(ann.get("x", 0) * w)
    by = int(ann.get("y", 0) * h)
    bw = int(ann.get("w", 0.2) * w)
    bh = int(ann.get("h", 0.2) * h)
    color = tuple(ann.get("color", [0, 200, 0]))
    alpha = ann.get("alpha", 0.2)
    border_width = ann.get("border_width", 2)

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)

    # 반투명 채우기
    fill_rgba = color + (int(255 * alpha),)
    odraw.rectangle([bx, by, bx + bw, by + bh], fill=fill_rgba)

    # 테두리 (불투명)
    border_rgba = color + (220,)
    odraw.rectangle([bx, by, bx + bw, by + bh], outline=border_rgba, width=border_width)

    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def _draw_numbered_box(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """번호가 붙은 감지 박스 (SoM 스타일)"""
    w, h = img.size
    bx = int(ann.get("x", 0) * w)
    by = int(ann.get("y", 0) * h)
    bw = int(ann.get("w", 0.2) * w)
    bh = int(ann.get("h", 0.2) * h)
    number = str(ann.get("number", "?"))
    color = tuple(ann.get("color", [0, 120, 255]))
    border_width = ann.get("border_width", 3)

    # 테두리
    draw.rectangle([bx, by, bx + bw, by + bh], outline=color, width=border_width)

    # 번호 태그 (좌상단)
    font_size = max(14, min(bw, bh) // 4)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), number, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad = 3

    # 번호 배경 원형
    tag_cx = bx
    tag_cy = by - th - pad * 2
    if tag_cy < 0:
        tag_cy = by + 2

    draw.rounded_rectangle(
        [tag_cx - pad, tag_cy - pad, tag_cx + tw + pad * 2, tag_cy + th + pad * 2],
        radius=6,
        fill=color,
    )
    draw.text((tag_cx + pad // 2, tag_cy), number, fill=(255, 255, 255), font=font)


def _draw_origin_marker(
    draw: ImageDraw.ImageDraw,
    img: Image.Image,
    ann: dict[str, Any],
) -> None:
    """원점 표시 (O 라벨 + 십자 마크)"""
    w, h = img.size
    cx = int(ann.get("cx", 0.5) * w)
    cy = int(ann.get("cy", 0.5) * h)
    color = tuple(ann.get("color", [255, 50, 50]))
    size = ann.get("size", 8)

    # 십자
    draw.line([(cx - size, cy), (cx + size, cy)], fill=color, width=2)
    draw.line([(cx, cy - size), (cx, cy + size)], fill=color, width=2)

    # O 라벨
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except (OSError, IOError):
        font = ImageFont.load_default()
    draw.text((cx + size + 2, cy + 2), "O", fill=color, font=font)


# 주석 타입 → 렌더 함수 매핑
_RENDERERS = {
    "grid": _draw_grid,
    "axes": _draw_axes,
    "ticks": _draw_ticks,
    "label": _draw_label,
    "highlight": _draw_highlight,
    "numbered_box": _draw_numbered_box,
    "origin": _draw_origin_marker,
}


# ============================================================================
# 메인 API
# ============================================================================

def annotate_image(
    image_bytes: bytes,
    annotations: list[dict[str, Any]],
) -> bytes:
    """
    이미지에 주석을 오버레이하여 PNG 바이트로 반환.

    Args:
        image_bytes: 원본 이미지 (PNG/JPEG)
        annotations: 주석 리스트. 각 dict는 "type" 키 필수.
            지원 타입: grid, axes, ticks, label, highlight, numbered_box, origin

    Returns:
        PNG 이미지 바이트
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(img)

    for ann in annotations:
        ann_type = ann.get("type", "")
        renderer = _RENDERERS.get(ann_type)
        if renderer:
            renderer(draw, img, ann)
        else:
            print(f"[Annotator] Unknown annotation type: {ann_type}")

    # PNG로 인코딩
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ============================================================================
# 프리셋
# ============================================================================

def create_math_graph_preset(
    grid_spacing: int = 40,
    show_axes: bool = True,
    show_ticks: bool = True,
    show_origin: bool = True,
    axis_cx: float = 0.5,
    axis_cy: float = 0.5,
) -> list[dict[str, Any]]:
    """
    수학 좌표 평면 그래프용 기본 주석 세트.
    VLM이 격자/축/원점을 명확히 인식하도록 보조.

    Args:
        grid_spacing: 격자 간격 (픽셀)
        show_axes: x/y 축 표시 여부
        show_ticks: 눈금 표시 여부
        show_origin: 원점 O 표시 여부
        axis_cx: 축 중심 x (0~1 정규화)
        axis_cy: 축 중심 y (0~1 정규화)

    Returns:
        주석 리스트
    """
    annotations: list[dict[str, Any]] = []

    # 1. 격자선 (연한 회색)
    annotations.append({
        "type": "grid",
        "spacing": grid_spacing,
        "color": [200, 200, 200],
        "alpha": 0.2,
    })

    # 2. 축 강조
    if show_axes:
        annotations.append({
            "type": "axes",
            "cx": axis_cx,
            "cy": axis_cy,
            "color": [220, 60, 60],
            "thickness": 2,
        })

    # 3. 눈금
    if show_ticks:
        annotations.append({
            "type": "ticks",
            "cx": axis_cx,
            "cy": axis_cy,
            "spacing": grid_spacing,
            "color": [150, 150, 150],
            "tick_length": 5,
        })

    # 4. 원점 표시
    if show_origin:
        annotations.append({
            "type": "origin",
            "cx": axis_cx,
            "cy": axis_cy,
            "color": [220, 60, 60],
            "size": 8,
        })

    return annotations


def create_detection_overlay(
    detections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    YOLO 감지 결과를 SoM 스타일 주석으로 변환.
    각 감지 영역에 번호와 색상을 부여.

    Args:
        detections: [{x, y, w, h, class, confidence, ...}] — 정규화 좌표 (0-1)

    Returns:
        주석 리스트 (numbered_box 타입)
    """
    # Desmos 스타일 색상 팔레트
    COLORS = [
        [37, 99, 235],   # 파랑
        [220, 38, 38],   # 빨강
        [22, 163, 74],   # 초록
        [168, 85, 247],  # 보라
        [234, 88, 12],   # 주황
        [6, 182, 212],   # 시안
    ]

    annotations: list[dict[str, Any]] = []
    for i, det in enumerate(detections):
        color = COLORS[i % len(COLORS)]
        circled_num = chr(0x2460 + i) if i < 20 else str(i + 1)  # ①②③...

        annotations.append({
            "type": "numbered_box",
            "x": det.get("x", 0),
            "y": det.get("y", 0),
            "w": det.get("w", 0.1),
            "h": det.get("h", 0.1),
            "number": circled_num,
            "color": color,
            "border_width": 3,
        })

    return annotations


# ============================================================================
# 자동 축 감지 (이미지 분석 기반)
# ============================================================================

def detect_axes_position(image_bytes: bytes) -> dict[str, float]:
    """
    이미지에서 축 위치를 자동 감지.
    진한 직선(축)의 위치를 히스토그램으로 추정.

    Returns:
        {"cx": 0.0~1.0, "cy": 0.0~1.0} — 추정된 축 중심 (정규화)
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L")  # 그레이스케일
    arr = np.array(img)

    h, w = arr.shape

    # 검은 픽셀이 밀집된 수평선(y축 위치) 찾기
    row_darkness = np.mean(arr < 80, axis=1)  # 각 행에서 어두운 픽셀 비율
    col_darkness = np.mean(arr < 80, axis=0)  # 각 열에서 어두운 픽셀 비율

    # 가장 어두운 행 = x축 후보, 가장 어두운 열 = y축 후보
    # 단, 이미지 가장자리(5%) 무시
    margin_h = int(h * 0.05)
    margin_w = int(w * 0.05)

    if margin_h < h - margin_h:
        cy_idx = np.argmax(row_darkness[margin_h:h - margin_h]) + margin_h
        cy = cy_idx / h
    else:
        cy = 0.5

    if margin_w < w - margin_w:
        cx_idx = np.argmax(col_darkness[margin_w:w - margin_w]) + margin_w
        cx = cx_idx / w
    else:
        cx = 0.5

    return {"cx": round(cx, 4), "cy": round(cy, 4)}
