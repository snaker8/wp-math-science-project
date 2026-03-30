"""
이미지 보정기 — 추출된 도식 이미지를 인쇄 품질로 보정
1. 해상도 체크 → 짧은 변 600px 미만이면 LANCZOS 업스케일
2. 그레이스케일 도식: 배경 평탄화 + 노이즈 제거
3. 컬러 도식: 샤프닝 + 대비 미세 조정
4. 300 DPI로 저장
"""

import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


class ImageEnhancer:
    """추출된 이미지를 인쇄 품질로 보정한다."""

    MIN_SHORT_SIDE = 1200  # 이 미만이면 업스케일 (인쇄 품질 보장)

    @staticmethod
    def enhance(
        image_path: str,
        output_path: str | None = None,
        target_short_side: int = 1200,
    ) -> dict:
        """
        이미지를 보정하고 결과 메타데이터를 반환한다.

        Returns:
            {
                "output_path": str,
                "original_size": (w, h),
                "enhanced_size": (w, h),
                "upscaled": bool,
                "is_grayscale": bool,
            }
        """
        img = Image.open(image_path)
        orig_w, orig_h = img.size
        upscaled = False

        if output_path is None:
            # _enhanced 접미사 추가
            p = Path(image_path)
            output_path = str(p.parent / f"{p.stem}_enhanced.png")

        # 1. 필요시 LANCZOS 업스케일
        short_side = min(orig_w, orig_h)
        if short_side < target_short_side:
            scale = max(2, (target_short_side // short_side) + 1)
            # 최대 6배로 제한 (과학 도식은 원본이 작을 수 있음)
            scale = min(scale, 6)
            img = img.resize(
                (orig_w * scale, orig_h * scale), Image.LANCZOS
            )
            upscaled = True

        # 2. 그레이스케일 여부 판별
        arr = np.array(img)
        is_grayscale = (
            len(arr.shape) == 2
            or (len(arr.shape) == 3 and arr.shape[2] == 1)
        )

        # 컬러 이미지도 사실상 그레이스케일인지 확인
        if not is_grayscale and len(arr.shape) == 3 and arr.shape[2] >= 3:
            # RGB 채널 차이가 거의 없으면 그레이스케일로 취급
            r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
            channel_diff = np.abs(r.astype(int) - g.astype(int)).mean() + \
                           np.abs(g.astype(int) - b.astype(int)).mean()
            if channel_diff < 5:
                is_grayscale = True

        if is_grayscale:
            result = _enhance_grayscale(img)
        else:
            result = _enhance_color(img)

        # 3. 300 DPI로 저장
        result.save(output_path, "PNG", dpi=(300, 300))

        return {
            "output_path": output_path,
            "original_size": (orig_w, orig_h),
            "enhanced_size": result.size,
            "upscaled": upscaled,
            "is_grayscale": is_grayscale,
        }


def _enhance_grayscale(img: Image.Image) -> Image.Image:
    """그레이스케일 도식 보정: 부드러운 배경 정리 + 대비 + 샤프닝"""
    gray = img.convert("L")

    # 배경 평탄화 — radius를 크게 해서 도식 디테일 보존
    bg = gray.filter(ImageFilter.GaussianBlur(radius=50))
    bg_arr = np.array(bg, dtype=np.float64)
    gray_arr = np.array(gray, dtype=np.float64)
    # 배경 보정 강도를 줄여서 디테일 보존 (0.7 블렌딩)
    flattened = np.clip(gray_arr * 0.3 + (gray_arr - bg_arr + 255.0) * 0.7, 0, 255).astype(np.uint8)

    result = Image.fromarray(flattened)

    # 대비 강화 (약하게)
    result = ImageEnhance.Contrast(result).enhance(1.3)

    # 샤프닝 (강하게 — 선명도가 핵심)
    result = ImageEnhance.Sharpness(result).enhance(1.5)
    result = result.filter(
        ImageFilter.UnsharpMask(radius=3, percent=150, threshold=2)
    )

    # 노이즈 정리: 아주 밝은 영역만 흰색 (임계값 상향)
    arr_final = np.array(result)
    arr_final[arr_final > 245] = 255
    return Image.fromarray(arr_final)


def _enhance_color(img: Image.Image) -> Image.Image:
    """컬러 도식 보정: 샤프닝 + 대비 미세 조정"""
    result = ImageEnhance.Sharpness(img).enhance(1.2)
    result = result.filter(
        ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3)
    )
    result = ImageEnhance.Contrast(result).enhance(1.1)
    return result
