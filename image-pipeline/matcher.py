"""
이미지 매칭 엔진 — 저화질 도식을 DB 고화질과 매칭
1단계: pHash 해밍 거리 (빠른 필터링)
2단계: 매칭 실패 시 → 업스케일 보정 → DB 신규 등록 (자동 성장)
"""

import os
from pathlib import Path

from db_manager import DiagramDBManager
from enhancer import ImageEnhancer


class ImageMatcher:
    """
    시험지의 저화질 도식을 DB 고화질 원본과 매칭한다.
    매칭 실패 시 업스케일 보정 후 DB에 신규 등록 (자동 성장 구조).
    """

    def __init__(self, db_manager: DiagramDBManager):
        self.db = db_manager

    def match(
        self,
        query_image_path: str,
        threshold: int = 40,
        subject: str = "math",
        source_name: str = "auto_registered",
    ) -> dict:
        """
        이미지를 DB에서 매칭한다.

        매칭 성공 시:
            {
                "matched": True,
                "distance": int,
                "db_image": { DB 엔트리 },
                "action": "matched"
            }

        매칭 실패 시 (자동 등록):
            {
                "matched": False,
                "distance": int | None,
                "action": "registered",
                "new_entry": { 새 DB 엔트리 },
                "enhanced": bool
            }
        """
        # 1단계: pHash 매칭
        matches = self.db.find_duplicates(query_image_path, threshold=threshold)

        if matches:
            best = matches[0]
            return {
                "matched": True,
                "distance": best["_distance"],
                "db_image": {k: v for k, v in best.items() if k != "_distance"},
                "action": "matched",
            }

        # 2단계: 매칭 실패 → 업스케일 보정 → DB 신규 등록
        return self._enhance_and_register(
            query_image_path,
            subject=subject,
            source_name=source_name,
        )

    def match_batch(
        self,
        image_paths: list[str],
        threshold: int = 40,
        subject: str = "math",
        source_name: str = "auto_registered",
    ) -> list[dict]:
        """여러 이미지를 일괄 매칭"""
        results = []
        for path in image_paths:
            try:
                result = self.match(
                    path,
                    threshold=threshold,
                    subject=subject,
                    source_name=source_name,
                )
                result["_source_path"] = path
                results.append(result)
            except Exception as e:
                results.append({
                    "matched": False,
                    "action": "error",
                    "error": str(e),
                    "_source_path": path,
                })

        # 일괄 처리 후 인덱스 저장
        self.db.save_index()
        return results

    def _enhance_and_register(
        self,
        image_path: str,
        subject: str,
        source_name: str,
    ) -> dict:
        """이미지를 보정하고 DB에 신규 등록한다."""
        enhanced = False
        enhanced_path = None

        try:
            result = ImageEnhancer.enhance(image_path)
            enhanced_path = result["output_path"]
            enhanced = result["upscaled"] or True  # 보정은 항상 적용
        except Exception:
            # 보정 실패 시 원본 그대로 등록
            pass

        entry = self.db.add_image(
            image_path=image_path,
            source_name=source_name,
            subject=subject,
            enhanced_path=enhanced_path,
        )

        if entry:
            self.db.save_index()
            return {
                "matched": False,
                "distance": None,
                "action": "registered",
                "new_entry": entry,
                "enhanced": enhanced,
            }

        # add_image가 None → 이미 중복 (해시 기반)
        return {
            "matched": False,
            "distance": None,
            "action": "duplicate_skipped",
            "enhanced": False,
        }
