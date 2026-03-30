"""
도식 이미지 DB 관리 — 로컬 인덱스 + Supabase Storage 업로드
- 로컬 index.json으로 이미지 인덱스 관리
- Supabase Storage 'diagram-images' 버킷에 원본/보정본 업로드
- Perceptual hash로 중복 체크 및 유사도 검색 기반 제공
"""

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image


class DiagramDBManager:
    """도식 이미지 DB 인덱스 관리자"""

    def __init__(self, db_root: str = "./dasaram_diagram_db"):
        self.db_root = Path(db_root)
        self.image_dir = self.db_root / "images"
        self.meta_dir = self.db_root / "metadata"
        self.index_path = self.db_root / "index.json"

        # 디렉토리 생성
        self.db_root.mkdir(parents=True, exist_ok=True)
        self.image_dir.mkdir(exist_ok=True)
        self.meta_dir.mkdir(exist_ok=True)

        # 인덱스 로드 또는 생성
        if self.index_path.exists():
            with open(self.index_path, "r", encoding="utf-8") as f:
                self.index = json.load(f)
        else:
            self.index = {
                "version": "1.0",
                "created": datetime.now().isoformat(),
                "total_images": 0,
                "sources": [],
                "images": [],
            }

    def save_index(self):
        """인덱스를 디스크에 저장"""
        self.index["updated"] = datetime.now().isoformat()
        self.index["total_images"] = len(self.index["images"])
        with open(self.index_path, "w", encoding="utf-8") as f:
            json.dump(self.index, f, ensure_ascii=False, indent=2)

    def compute_phash(self, image_path: str, hash_size: int = 16) -> str:
        """Perceptual Hash 계산 (유사 이미지 매칭용)"""
        img = (
            Image.open(image_path)
            .convert("L")
            .resize((hash_size, hash_size), Image.LANCZOS)
        )
        arr = np.array(img)
        avg = arr.mean()
        return "".join(["1" if b else "0" for b in (arr > avg).flatten()])

    def compute_file_hash(self, filepath: str) -> str:
        """파일 MD5 해시 (중복 체크용)"""
        with open(filepath, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()

    def add_image(
        self,
        image_path: str,
        source_name: str,
        subject: str = "math",
        page: int = 0,
        tags: dict | None = None,
        enhanced_path: str | None = None,
        science_subject: str | None = None,
        unit_code: str | None = None,
        unit_name: str | None = None,
    ) -> dict | None:
        """
        이미지를 DB에 추가한다.

        Returns:
            추가된 DB 엔트리 dict 또는 중복 시 None
        """
        target_path = enhanced_path or image_path
        file_hash = self.compute_file_hash(target_path)

        # 중복 체크
        existing_hashes = {img["file_hash"] for img in self.index["images"]}
        if file_hash in existing_hashes:
            return None

        # 이미지 메타데이터
        img = Image.open(target_path)
        w, h = img.size

        phash = self.compute_phash(target_path)

        # 과목별 하위 디렉토리에 복사
        subject_dir = self.image_dir / subject / source_name
        subject_dir.mkdir(parents=True, exist_ok=True)
        dest_filename = Path(target_path).name
        dest_path = subject_dir / dest_filename

        # 같은 경로가 아닌 경우에만 복사
        if str(Path(target_path).resolve()) != str(dest_path.resolve()):
            import shutil
            shutil.copy2(target_path, dest_path)

        # 상대 경로로 저장
        rel_path = str(dest_path.relative_to(self.db_root))

        # 고유 ID 생성
        prefix = subject.upper()[:3]
        entry_id = f"{prefix}-{file_hash[:8]}"

        entry = {
            "id": entry_id,
            "filename": dest_filename,
            "filepath": rel_path,
            "original_path": image_path,
            "source": source_name,
            "subject": subject,
            "page": page,
            "width": w,
            "height": h,
            "phash": phash,
            "file_hash": file_hash,
            "science_subject": science_subject,
            "unit_code": unit_code,
            "unit_name": unit_name,
            "tags": tags or {"subject": subject, "diagram_type": "미분류", "tags": []},
            "added": datetime.now().isoformat(),
        }

        self.index["images"].append(entry)
        return entry

    def add_source(
        self,
        source_name: str,
        file_path: str,
        subject: str,
        extracted_count: int,
    ):
        """소스(PDF/HWP) 기록 추가"""
        self.index["sources"].append(
            {
                "name": source_name,
                "file": file_path,
                "subject": subject,
                "extracted_count": extracted_count,
                "date": datetime.now().isoformat(),
            }
        )

    def find_duplicates(self, image_path: str, threshold: int = 40) -> list[dict]:
        """Perceptual Hash로 유사 이미지 검색"""
        query_hash = self.compute_phash(image_path)
        matches = []

        for item in self.index["images"]:
            if "phash" not in item:
                continue
            dist = _hamming_distance(query_hash, item["phash"])
            if dist < threshold:
                matches.append({**item, "_distance": dist})

        matches.sort(key=lambda x: x["_distance"])
        return matches

    def search(
        self,
        subject: str | None = None,
        diagram_type: str | None = None,
        query_tags: list[str] | None = None,
        unit_code: str | None = None,
    ) -> list[dict]:
        """DB 검색"""
        results = self.index["images"]

        if subject:
            results = [r for r in results if r.get("subject") == subject]

        if diagram_type:
            results = [
                r
                for r in results
                if diagram_type in r.get("tags", {}).get("diagram_type", "")
            ]

        if query_tags:
            results = [
                r
                for r in results
                if any(tag in str(r.get("tags", {})) for tag in query_tags)
            ]

        if unit_code:
            results = [
                r
                for r in results
                if (r.get("unit_code") or "").startswith(unit_code)
            ]

        return results

    def stats(self) -> dict:
        """DB 통계"""
        subjects: dict[str, int] = {}
        for img in self.index["images"]:
            subj = img.get("subject", "unknown")
            subjects[subj] = subjects.get(subj, 0) + 1

        return {
            "total_images": self.index["total_images"],
            "sources_count": len(self.index["sources"]),
            "by_subject": subjects,
        }


def _hamming_distance(hash1: str, hash2: str) -> int:
    """두 해시 간 해밍 거리 (작을수록 유사)"""
    return sum(c1 != c2 for c1, c2 in zip(hash1, hash2))
