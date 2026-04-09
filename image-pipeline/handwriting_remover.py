"""
낙서/필기 제거기 — 시험지 스캔 이미지에서 손글씨를 제거하여 OCR 정확도 향상

전략:
1. 인쇄체(검정, 균일 획폭)와 손글씨(연필/펜, 불규칙 획폭) 구분
2. 색상 기반: 연필(회색), 빨간펜, 파란펜 등 인쇄 잉크와 다른 색상 제거
3. 형태학적 분석: 인쇄체보다 굵거나 불규칙한 획 제거
4. 연결 성분 분석: 인쇄 텍스트 영역 밖의 고립된 획 제거
"""

import cv2
import numpy as np
from pathlib import Path


def remove_handwriting(
    image_path: str,
    output_path: str | None = None,
    aggressiveness: float = 0.5,
) -> dict:
    """
    시험지 이미지에서 손글씨/낙서를 제거한다.

    Args:
        image_path: 입력 이미지 경로
        output_path: 출력 경로 (None이면 덮어쓰기)
        aggressiveness: 제거 강도 0.0~1.0 (높을수록 공격적)

    Returns:
        dict: { cleaned: bool, removed_ratio: float, output_path: str }
    """
    if output_path is None:
        output_path = image_path

    img = cv2.imread(image_path)
    if img is None:
        return {"cleaned": False, "error": "이미지를 읽을 수 없습니다."}

    original = img.copy()
    h, w = img.shape[:2]

    # 1단계: 컬러 필기 제거 (빨간펜, 파란펜 등)
    color_mask = detect_colored_handwriting(img)

    # 2단계: 연필/흑색 필기 제거 (밝기 기반)
    pencil_mask = detect_pencil_handwriting(img, aggressiveness)

    # 3단계: 마스크 합치기
    combined_mask = cv2.bitwise_or(color_mask, pencil_mask)

    # 4단계: 인쇄 텍스트 보호 (밀도 높은 영역은 건드리지 않음)
    protected = protect_printed_text(img, combined_mask)

    # 5단계: 마스크 영역을 흰색으로 채우기 (인페인팅)
    result = img.copy()
    result[protected > 0] = [255, 255, 255]

    # 저장
    cv2.imwrite(output_path, result)

    # 제거 비율 계산
    total_pixels = h * w
    removed_pixels = np.count_nonzero(protected)
    removed_ratio = removed_pixels / total_pixels

    return {
        "cleaned": True,
        "removed_ratio": round(removed_ratio, 4),
        "output_path": output_path,
        "width": w,
        "height": h,
    }


def detect_colored_handwriting(img: np.ndarray) -> np.ndarray:
    """빨간펜, 파란펜 등 컬러 필기 감지"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # 빨간색 영역 (빨간펜)
    red_mask1 = cv2.inRange(hsv, np.array([0, 50, 50]), np.array([10, 255, 255]))
    red_mask2 = cv2.inRange(hsv, np.array([170, 50, 50]), np.array([180, 255, 255]))
    red_mask = cv2.bitwise_or(red_mask1, red_mask2)

    # 파란색 영역 (파란펜)
    blue_mask = cv2.inRange(hsv, np.array([100, 50, 50]), np.array([130, 255, 255]))

    # 초록색 영역 (형광펜 등)
    green_mask = cv2.inRange(hsv, np.array([35, 50, 50]), np.array([85, 255, 255]))

    # 합치기
    color_mask = cv2.bitwise_or(red_mask, blue_mask)
    color_mask = cv2.bitwise_or(color_mask, green_mask)

    # 팽창으로 약간 확대 (필기 획 완전히 포함)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    color_mask = cv2.dilate(color_mask, kernel, iterations=1)

    return color_mask


def detect_pencil_handwriting(img: np.ndarray, aggressiveness: float) -> np.ndarray:
    """연필/흑색 필기 감지 — 인쇄체보다 밝은 회색 톤"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 인쇄체: 진한 검정 (0~80), 연필 필기: 회색 (80~160)
    # aggressiveness로 임계값 조절
    pencil_low = int(80 - aggressiveness * 30)  # 0.5 → 65
    pencil_high = int(160 + aggressiveness * 20)  # 0.5 → 170

    # 배경(흰색, >200)과 인쇄(검정, <pencil_low)를 제외한 회색 영역
    pencil_mask = cv2.inRange(gray, pencil_low, pencil_high)

    # 작은 노이즈 제거
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    pencil_mask = cv2.morphologyEx(pencil_mask, cv2.MORPH_OPEN, kernel)

    # 연결 성분 분석: 작은 점/노이즈 제거, 큰 영역만 유지
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(pencil_mask, connectivity=8)

    min_area = 20  # 최소 면적
    max_area = img.shape[0] * img.shape[1] * 0.01  # 전체의 1% 이하

    filtered_mask = np.zeros_like(pencil_mask)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if min_area < area < max_area:
            filtered_mask[labels == i] = 255

    return filtered_mask


def protect_printed_text(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    인쇄 텍스트 영역을 보호 — 마스크에서 인쇄 텍스트와 겹치는 부분 제거

    인쇄 텍스트: 진한 검정(< 60), 균일한 획폭
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 인쇄 텍스트 영역: 매우 진한 검정
    _, print_mask = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)

    # 인쇄 텍스트 영역 팽창 (보호 범위 확대)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    print_protected = cv2.dilate(print_mask, kernel, iterations=2)

    # 마스크에서 인쇄 텍스트 보호 영역 제거
    result = cv2.bitwise_and(mask, cv2.bitwise_not(print_protected))

    return result


def clean_exam_image(image_path: str, output_path: str | None = None) -> dict:
    """
    시험지 이미지 전처리 파이프라인:
    1. 낙서 제거
    2. 대비 향상
    3. 노이즈 제거
    """
    result = remove_handwriting(image_path, output_path, aggressiveness=0.5)

    if not result.get("cleaned"):
        return result

    # 추가 보정: 대비 향상
    out = result["output_path"]
    img = cv2.imread(out)
    if img is not None:
        # CLAHE (적응적 히스토그램 평활화) — 인쇄 텍스트 선명도 향상
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        enhanced = cv2.merge([l, a, b])
        enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        cv2.imwrite(out, enhanced)

    return result
