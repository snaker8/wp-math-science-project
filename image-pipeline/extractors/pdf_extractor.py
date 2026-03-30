"""
PDF에서 임베디드 이미지를 원본 해상도로 추출
- PyMuPDF(fitz) 사용: page.get_images() → doc.extract_image(xref)
- 대용량 PDF: 10페이지 청크 단위 처리 + 메모리 해제
- 콜백으로 진행상황 전달
"""

import gc
import os
from pathlib import Path
from typing import Callable

from PIL import Image


class PDFImageExtractor:
    """PDF에서 임베디드 이미지를 고화질로 추출한다."""

    CHUNK_SIZE = 10  # 한 번에 처리할 페이지 수

    def __init__(self, pdf_path: str, output_dir: str):
        self.pdf_path = pdf_path
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def get_page_count(self) -> int:
        """PDF 총 페이지 수 반환"""
        import fitz
        doc = fitz.open(self.pdf_path)
        count = len(doc)
        doc.close()
        return count

    def extract_with_pymupdf(
        self,
        min_size: tuple[int, int] = (100, 100),
        on_progress: Callable[[int, int], None] | None = None,
    ) -> list[dict]:
        """PyMuPDF로 임베디드 이미지 직접 추출 — 청크 단위 메모리 관리"""
        import fitz

        doc = fitz.open(self.pdf_path)
        total_pages = len(doc)
        extracted = []
        seen_xrefs: set[int] = set()

        for chunk_start in range(0, total_pages, self.CHUNK_SIZE):
            chunk_end = min(chunk_start + self.CHUNK_SIZE, total_pages)

            for page_num in range(chunk_start, chunk_end):
                page = doc[page_num]
                image_list = page.get_images(full=True)

                for img_idx, img_info in enumerate(image_list):
                    xref = img_info[0]

                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)

                    try:
                        base_image = doc.extract_image(xref)
                    except Exception:
                        continue
                    if not base_image:
                        continue

                    img_bytes = base_image["image"]
                    img_ext = base_image["ext"]
                    width = base_image["width"]
                    height = base_image["height"]

                    if width < min_size[0] or height < min_size[1]:
                        continue

                    filename = f"page{page_num + 1:03d}_img{img_idx + 1:02d}.{img_ext}"
                    filepath = self.output_dir / filename

                    with open(filepath, "wb") as f:
                        f.write(img_bytes)

                    # PPM/TIFF → PNG 변환
                    if img_ext.lower() in ("ppm", "tiff", "tif", "bmp"):
                        png_path = filepath.with_suffix(".png")
                        img = Image.open(filepath)
                        img.save(png_path, "PNG")
                        img.close()
                        filepath.unlink()
                        filepath = png_path
                        filename = png_path.name

                    extracted.append(
                        {
                            "filename": filename,
                            "filepath": str(filepath),
                            "page": page_num + 1,
                            "xref": xref,
                            "width": width,
                            "height": height,
                            "format": img_ext,
                            "size_bytes": len(img_bytes),
                        }
                    )

                # 진행상황 콜백
                if on_progress:
                    on_progress(page_num + 1, total_pages)

            # 청크 완료 후 메모리 해제
            gc.collect()

        doc.close()
        return extracted

    def extract_pages_as_images(
        self,
        dpi: int = 200,
        on_progress: Callable[[int, int], None] | None = None,
    ) -> list[dict]:
        """페이지를 이미지로 렌더링 — 청크 단위 처리"""
        import fitz

        doc = fitz.open(self.pdf_path)
        total_pages = len(doc)
        page_dir = self.output_dir / "pages"
        page_dir.mkdir(exist_ok=True)
        pages = []

        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)

        for chunk_start in range(0, total_pages, self.CHUNK_SIZE):
            chunk_end = min(chunk_start + self.CHUNK_SIZE, total_pages)

            for page_num in range(chunk_start, chunk_end):
                page = doc[page_num]
                pix = page.get_pixmap(matrix=mat)
                filename = f"page_{page_num + 1:03d}.png"
                filepath = page_dir / filename
                pix.save(str(filepath))

                pages.append(
                    {
                        "filename": filename,
                        "filepath": str(filepath),
                        "page": page_num + 1,
                        "width": pix.width,
                        "height": pix.height,
                        "dpi": dpi,
                    }
                )

                # pixmap 즉시 해제
                del pix

                if on_progress:
                    on_progress(page_num + 1, total_pages)

            # 청크 완료 후 GC
            gc.collect()

        doc.close()
        return pages

    def extract(
        self,
        min_size: tuple[int, int] = (100, 100),
        on_progress: Callable[[int, int], None] | None = None,
    ) -> list[dict]:
        """최적 방법으로 추출"""
        return self.extract_with_pymupdf(min_size=min_size, on_progress=on_progress)
