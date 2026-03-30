"""
=================================================================
다사람 과학 도식 DB 구축 파이프라인
=================================================================
교과서/문제집 PDF → 도식 이미지 자동 추출 → 보정 → 메타데이터 태깅 → DB 저장
시험지 업로드 시 저화질 도식을 고화질 DB 이미지로 자동 교체

[필요 패키지]
pip install PyMuPDF Pillow numpy openai anthropic

[사용법]
1. 도식 DB 구축:  python science_diagram_pipeline.py build --pdf textbook.pdf --subject physics
2. 시험지 변환:   python science_diagram_pipeline.py convert --input exam_scan.pdf --output clean_exam.pdf
"""

import os
import sys
import json
import hashlib
import argparse
import subprocess
from pathlib import Path
from datetime import datetime

# ============================================================
# 설정
# ============================================================
CONFIG = {
    "db_root": "./dasaram_science_db",        # DB 루트 디렉토리
    "image_dir": "./dasaram_science_db/images", # 추출 이미지 저장
    "meta_dir": "./dasaram_science_db/metadata", # 메타데이터 JSON
    "index_file": "./dasaram_science_db/index.json", # 전체 인덱스
    "watermark_text": "dasaram",               # 워터마크 (과사람)
    "min_image_size": (100, 100),              # 최소 이미지 크기 (너무 작은 건 스킵)
    "max_image_size": (5000, 5000),            # 최대 이미지 크기
    "upscale_target": 300,                      # 목표 DPI
}

# 과목별 단원 분류 체계 (2022 개정 교육과정 기준)
SCIENCE_CURRICULUM = {
    "physics": {
        "name": "물리",
        "units": {
            "PHY-01": "힘과 운동",
            "PHY-02": "에너지와 전환",
            "PHY-03": "전기와 자기",
            "PHY-04": "파동과 빛",
            "PHY-05": "열과 에너지",
            "PHY-06": "원자와 원자핵",
        }
    },
    "chemistry": {
        "name": "화학",
        "units": {
            "CHM-01": "물질의 구조",
            "CHM-02": "화학 결합",
            "CHM-03": "화학 반응",
            "CHM-04": "산과 염기",
            "CHM-05": "산화 환원",
            "CHM-06": "전기 화학",
        }
    },
    "biology": {
        "name": "생물",
        "units": {
            "BIO-01": "세포의 구조와 기능",
            "BIO-02": "소화 순환 호흡 배설",
            "BIO-03": "자극과 반응",
            "BIO-04": "생식과 유전",
            "BIO-05": "생태계와 환경",
            "BIO-06": "진화와 다양성",
        }
    },
    "earth_science": {
        "name": "지구과학",
        "units": {
            "EAR-01": "지구의 구조",
            "EAR-02": "지각 변동과 판구조론",
            "EAR-03": "대기와 해양",
            "EAR-04": "태양계와 별",
            "EAR-05": "우주의 구조",
            "EAR-06": "지질 시대와 화석",
        }
    }
}


# ============================================================
# 1단계: PDF에서 이미지 추출
# ============================================================
class PDFImageExtractor:
    """PDF에서 모든 이미지를 고화질로 추출"""
    
    def __init__(self, pdf_path, output_dir):
        self.pdf_path = pdf_path
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def extract_with_pymupdf(self):
        """PyMuPDF로 임베디드 이미지 직접 추출 (최고 화질)"""
        import fitz  # PyMuPDF
        
        doc = fitz.open(self.pdf_path)
        extracted = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                
                if base_image:
                    img_bytes = base_image["image"]
                    img_ext = base_image["ext"]
                    width = base_image["width"]
                    height = base_image["height"]
                    
                    # 너무 작은 이미지 스킵 (아이콘, 장식 등)
                    if width < CONFIG["min_image_size"][0] or height < CONFIG["min_image_size"][1]:
                        continue
                    
                    # 저장
                    filename = f"page{page_num+1:03d}_img{img_idx+1:02d}.{img_ext}"
                    filepath = self.output_dir / filename
                    
                    with open(filepath, "wb") as f:
                        f.write(img_bytes)
                    
                    extracted.append({
                        "filename": filename,
                        "filepath": str(filepath),
                        "page": page_num + 1,
                        "width": width,
                        "height": height,
                        "format": img_ext,
                        "size_bytes": len(img_bytes),
                    })
                    
                    print(f"  [추출] 페이지 {page_num+1} - {filename} ({width}x{height})")
        
        doc.close()
        return extracted
    
    def extract_with_poppler(self, dpi=300):
        """poppler pdfimages로 추출 (PyMuPDF 없을 때 대안)"""
        prefix = str(self.output_dir / "img")
        
        # pdfimages: PDF 내 임베디드 이미지 직접 추출
        subprocess.run([
            "pdfimages", "-all", self.pdf_path, prefix
        ], capture_output=True)
        
        # 추출된 파일 목록 수집
        extracted = []
        for f in sorted(self.output_dir.iterdir()):
            if f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.ppm', '.tiff']:
                from PIL import Image
                img = Image.open(f)
                w, h = img.size
                
                if w < CONFIG["min_image_size"][0] or h < CONFIG["min_image_size"][1]:
                    f.unlink()  # 작은 이미지 삭제
                    continue
                
                # PPM을 PNG로 변환
                if f.suffix.lower() == '.ppm':
                    new_path = f.with_suffix('.png')
                    img.save(new_path, 'PNG')
                    f.unlink()
                    f = new_path
                
                extracted.append({
                    "filename": f.name,
                    "filepath": str(f),
                    "width": w,
                    "height": h,
                    "format": f.suffix[1:],
                    "size_bytes": f.stat().st_size,
                })
                print(f"  [추출] {f.name} ({w}x{h})")
        
        return extracted
    
    def extract_pages_as_images(self, dpi=300):
        """페이지 전체를 고해상도 이미지로 렌더링 (도식 영역 후속 감지용)"""
        page_dir = self.output_dir / "pages"
        page_dir.mkdir(exist_ok=True)
        
        prefix = str(page_dir / "page")
        subprocess.run([
            "pdftoppm", "-png", "-r", str(dpi), self.pdf_path, prefix
        ], capture_output=True)
        
        pages = sorted(page_dir.glob("*.png"))
        print(f"  [페이지 렌더링] {len(pages)}페이지 완료 ({dpi}dpi)")
        return [str(p) for p in pages]
    
    def extract(self):
        """최적 방법으로 추출"""
        try:
            import fitz
            print("[PyMuPDF 사용] 임베디드 이미지 직접 추출...")
            return self.extract_with_pymupdf()
        except ImportError:
            print("[poppler 사용] pdfimages로 추출...")
            return self.extract_with_poppler()


# ============================================================
# 2단계: 이미지 보정 (업스케일 + 배경 정리 + 노이즈 제거)
# ============================================================
class ImageEnhancer:
    """추출된 이미지를 인쇄 품질로 보정"""
    
    @staticmethod
    def enhance(image_path, output_path=None):
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
        import numpy as np
        
        img = Image.open(image_path)
        
        if output_path is None:
            output_path = image_path  # 원본 덮어쓰기
        
        # PDF에서 직접 추출한 이미지는 이미 고화질이므로
        # 가벼운 보정만 적용
        
        # 1. 그레이스케일 도식인 경우 처리
        arr = np.array(img)
        if len(arr.shape) == 2 or (len(arr.shape) == 3 and arr.shape[2] == 1):
            # 이미 그레이스케일
            gray = img if img.mode == 'L' else img.convert('L')
        elif len(arr.shape) == 3:
            # 컬러 이미지 - 그대로 유지 (컬러 도식일 수 있음)
            gray = None
        
        if gray:
            # 배경 평탄화
            bg = gray.filter(ImageFilter.GaussianBlur(radius=30))
            bg_arr = np.array(bg, dtype=np.float64)
            gray_arr = np.array(gray, dtype=np.float64)
            flattened = np.clip(gray_arr - bg_arr + 255.0, 0, 255).astype(np.uint8)
            
            result = Image.fromarray(flattened)
            result = ImageEnhance.Contrast(result).enhance(1.5)
            result = ImageEnhance.Sharpness(result).enhance(1.3)
            
            # 배경 노이즈 정리
            arr_final = np.array(result)
            arr_final[arr_final > 230] = 255
            result = Image.fromarray(arr_final)
        else:
            # 컬러 이미지는 샤프닝만
            result = ImageEnhance.Sharpness(img).enhance(1.2)
            result = ImageEnhance.Contrast(result).enhance(1.1)
        
        result.save(output_path, dpi=(300, 300), quality=95)
        return output_path
    
    @staticmethod
    def add_watermark(image_path, text="dasaram", output_path=None):
        """워터마크 추가"""
        from PIL import Image, ImageDraw, ImageFont
        
        img = Image.open(image_path).convert('RGBA')
        
        # 투명 레이어 생성
        watermark = Image.new('RGBA', img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(watermark)
        
        try:
            font = ImageFont.truetype(
                '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 
                max(12, img.size[0] // 40)
            )
        except:
            font = ImageFont.load_default()
        
        # 오른쪽 하단에 반투명 워터마크
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = img.size[0] - text_w - 10
        y = img.size[1] - text_h - 10
        
        draw.text((x, y), text, fill=(150, 150, 150, 80), font=font)
        
        result = Image.alpha_composite(img, watermark).convert('RGB')
        
        if output_path is None:
            output_path = image_path
        result.save(output_path, dpi=(300, 300), quality=95)
        return output_path


# ============================================================
# 3단계: AI 기반 메타데이터 자동 태깅
# ============================================================
class DiagramTagger:
    """AI로 도식 이미지의 과목/단원/키워드 자동 분류"""
    
    def __init__(self, api_provider="anthropic"):
        self.api_provider = api_provider
    
    def tag_with_anthropic(self, image_path):
        """Claude API로 이미지 분석 및 태깅"""
        import anthropic
        import base64
        
        client = anthropic.Anthropic()
        
        with open(image_path, "rb") as f:
            image_data = base64.standard_b64encode(f.read()).decode("utf-8")
        
        # 이미지 확장자로 media_type 결정
        ext = Path(image_path).suffix.lower()
        media_types = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}
        media_type = media_types.get(ext, 'image/png')
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        }
                    },
                    {
                        "type": "text",
                        "text": """이 과학 교과서 도식 이미지를 분석해서 아래 JSON 형식으로만 응답해주세요.
{
  "subject": "physics/chemistry/biology/earth_science 중 하나",
  "grade_level": "중1/중2/중3/고1/고2/고3 중 하나",
  "unit_keywords": ["단원 키워드들"],
  "diagram_type": "도식 유형 (예: 회로도, 에너지전환도, 세포구조도 등)",
  "description": "이 도식이 무엇을 나타내는지 한 줄 설명",
  "labels": ["도식 안에 있는 텍스트 라벨들"],
  "tags": ["검색용 태그 5-10개"]
}
JSON만 출력하세요."""
                    }
                ]
            }]
        )
        
        # JSON 파싱
        text = response.content[0].text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"error": "파싱 실패", "raw": text}
    
    def tag_with_openai(self, image_path):
        """GPT-4o API로 이미지 분석 및 태깅"""
        import openai
        import base64
        
        client = openai.OpenAI()
        
        with open(image_path, "rb") as f:
            image_data = base64.standard_b64encode(f.read()).decode("utf-8")
        
        ext = Path(image_path).suffix.lower()
        media_type = "image/png" if ext == ".png" else "image/jpeg"
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {
                        "url": f"data:{media_type};base64,{image_data}"
                    }},
                    {"type": "text", "text": """이 과학 교과서 도식 이미지를 분석해서 아래 JSON 형식으로만 응답해주세요.
{
  "subject": "physics/chemistry/biology/earth_science 중 하나",
  "grade_level": "중1/중2/중3/고1/고2/고3 중 하나",
  "unit_keywords": ["단원 키워드들"],
  "diagram_type": "도식 유형",
  "description": "한 줄 설명",
  "labels": ["도식 안 텍스트들"],
  "tags": ["검색용 태그 5-10개"]
}"""}
                ]
            }],
            max_tokens=500
        )
        
        text = response.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"error": "파싱 실패", "raw": text}
    
    def tag(self, image_path):
        """설정된 API로 태깅"""
        if self.api_provider == "anthropic":
            return self.tag_with_anthropic(image_path)
        else:
            return self.tag_with_openai(image_path)


# ============================================================
# 4단계: 이미지 유사도 매칭 (시험지 도식 → DB 매칭)
# ============================================================
class ImageMatcher:
    """시험지의 저화질 도식을 DB의 고화질 원본과 매칭"""
    
    def __init__(self, db_index_path):
        with open(db_index_path, 'r', encoding='utf-8') as f:
            self.index = json.load(f)
    
    def compute_hash(self, image_path):
        """이미지의 perceptual hash 계산 (유사 이미지 매칭용)"""
        from PIL import Image
        import numpy as np
        
        img = Image.open(image_path).convert('L').resize((16, 16), Image.LANCZOS)
        arr = np.array(img)
        avg = arr.mean()
        bits = (arr > avg).flatten()
        
        # 비트를 hex 문자열로
        hash_val = ''.join(['1' if b else '0' for b in bits])
        return hash_val
    
    def hamming_distance(self, hash1, hash2):
        """두 해시 간 해밍 거리 (작을수록 유사)"""
        return sum(c1 != c2 for c1, c2 in zip(hash1, hash2))
    
    def find_match(self, query_image_path, threshold=40):
        """DB에서 가장 유사한 이미지 찾기"""
        query_hash = self.compute_hash(query_image_path)
        
        best_match = None
        best_distance = float('inf')
        
        for item in self.index.get("images", []):
            if "phash" in item:
                dist = self.hamming_distance(query_hash, item["phash"])
                if dist < best_distance:
                    best_distance = dist
                    best_match = item
        
        if best_match and best_distance < threshold:
            return {
                "matched": True,
                "distance": best_distance,
                "db_image": best_match,
            }
        
        return {"matched": False, "distance": best_distance}
    
    def find_match_with_ai(self, query_image_path, candidates, api_provider="anthropic"):
        """AI로 정밀 매칭 (해시 매칭 후 후보가 여러 개일 때)"""
        # 해시로 상위 5개 후보 선정 후 AI에게 최종 판단 요청
        # (구현은 DiagramTagger와 유사한 패턴)
        pass


# ============================================================
# 5단계: 시험지 변환 (저화질 → 고화질 교체)
# ============================================================
class ExamConverter:
    """시험지의 저화질 도식을 DB 고화질로 교체"""
    
    def __init__(self, db_root):
        self.db_root = Path(db_root)
        self.matcher = ImageMatcher(str(self.db_root / "index.json"))
    
    def extract_diagrams_from_exam(self, exam_image_path):
        """시험지 이미지에서 도식 영역 감지 및 추출"""
        from PIL import Image
        import numpy as np
        
        img = Image.open(exam_image_path).convert('L')
        arr = np.array(img)
        
        # 간단한 연결 영역 분석으로 도식 영역 감지
        # (실제로는 YOLO나 AI 기반 레이아웃 분석 사용)
        
        # 여기서는 기본적인 윤곽선 기반 감지
        binary = (arr < 200).astype(np.uint8)
        
        regions = []
        # ... 영역 감지 로직 (OpenCV contour 등)
        
        return regions
    
    def replace_diagram(self, exam_image_path, region, replacement_path, output_path):
        """시험지의 특정 영역을 DB 이미지로 교체"""
        from PIL import Image
        
        exam = Image.open(exam_image_path)
        replacement = Image.open(replacement_path)
        
        # 영역 크기에 맞게 리사이즈
        x, y, w, h = region
        replacement = replacement.resize((w, h), Image.LANCZOS)
        
        # 교체
        exam.paste(replacement, (x, y))
        exam.save(output_path, dpi=(300, 300))
        
        return output_path
    
    def convert_exam(self, exam_path, output_path):
        """시험지 전체 변환"""
        print(f"[시험지 변환] {exam_path}")
        
        # 1. 시험지에서 도식 영역 추출
        regions = self.extract_diagrams_from_exam(exam_path)
        
        replaced_count = 0
        for region_info in regions:
            # 2. 각 도식을 DB에서 매칭
            match = self.matcher.find_match(region_info["image_path"])
            
            if match["matched"]:
                # 3. 고화질로 교체
                self.replace_diagram(
                    exam_path,
                    region_info["bbox"],
                    match["db_image"]["filepath"],
                    output_path
                )
                replaced_count += 1
                print(f"  [교체] {region_info['id']} → {match['db_image']['filename']} (거리: {match['distance']})")
            else:
                print(f"  [미매칭] {region_info['id']} - DB에 매칭 이미지 없음")
        
        print(f"[완료] {replaced_count}개 도식 교체됨")
        return output_path


# ============================================================
# 메인: DB 구축 파이프라인
# ============================================================
class ScienceDiagramDB:
    """전체 파이프라인 관리"""
    
    def __init__(self):
        self.db_root = Path(CONFIG["db_root"])
        self.image_dir = Path(CONFIG["image_dir"])
        self.meta_dir = Path(CONFIG["meta_dir"])
        
        # 디렉토리 생성
        self.db_root.mkdir(parents=True, exist_ok=True)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.meta_dir.mkdir(parents=True, exist_ok=True)
        
        # 인덱스 로드 또는 생성
        self.index_path = Path(CONFIG["index_file"])
        if self.index_path.exists():
            with open(self.index_path, 'r', encoding='utf-8') as f:
                self.index = json.load(f)
        else:
            self.index = {
                "version": "1.0",
                "created": datetime.now().isoformat(),
                "total_images": 0,
                "sources": [],
                "images": []
            }
    
    def save_index(self):
        """인덱스 저장"""
        self.index["updated"] = datetime.now().isoformat()
        self.index["total_images"] = len(self.index["images"])
        with open(self.index_path, 'w', encoding='utf-8') as f:
            json.dump(self.index, f, ensure_ascii=False, indent=2)
    
    def build_from_pdf(self, pdf_path, subject="physics", source_name=None, 
                        auto_tag=False, add_watermark=False):
        """PDF에서 도식 추출 → 보정 → DB 저장"""
        
        pdf_path = str(pdf_path)
        if source_name is None:
            source_name = Path(pdf_path).stem
        
        print(f"\n{'='*60}")
        print(f"[DB 구축] {source_name}")
        print(f"  PDF: {pdf_path}")
        print(f"  과목: {subject}")
        print(f"{'='*60}\n")
        
        # 1. 이미지 추출
        print("[1/4] 이미지 추출 중...")
        source_dir = self.image_dir / source_name
        extractor = PDFImageExtractor(pdf_path, str(source_dir))
        extracted = extractor.extract()
        print(f"  → {len(extracted)}개 이미지 추출 완료\n")
        
        if not extracted:
            # 임베디드 이미지가 없으면 페이지 렌더링
            print("  임베디드 이미지 없음. 페이지 렌더링으로 전환...")
            pages = extractor.extract_pages_as_images(dpi=300)
            # TODO: 페이지 이미지에서 도식 영역 자동 감지
        
        # 2. 이미지 보정
        print("[2/4] 이미지 보정 중...")
        enhancer = ImageEnhancer()
        for item in extracted:
            enhanced_path = str(source_dir / f"enhanced_{item['filename']}")
            enhancer.enhance(item["filepath"], enhanced_path)
            item["enhanced_path"] = enhanced_path
            
            if add_watermark:
                enhancer.add_watermark(enhanced_path, CONFIG["watermark_text"])
            
            print(f"  [보정] {item['filename']}")
        print()
        
        # 3. AI 태깅 (선택)
        if auto_tag:
            print("[3/4] AI 자동 태깅 중...")
            tagger = DiagramTagger()
            for item in extracted:
                tags = tagger.tag(item.get("enhanced_path", item["filepath"]))
                item["tags"] = tags
                print(f"  [태깅] {item['filename']}: {tags.get('diagram_type', 'unknown')}")
            print()
        else:
            print("[3/4] AI 태깅 건너뜀 (--auto-tag 옵션으로 활성화)\n")
            for item in extracted:
                item["tags"] = {
                    "subject": subject,
                    "diagram_type": "미분류",
                    "tags": [],
                }
        
        # 4. 인덱스에 추가
        print("[4/4] DB 인덱스 업데이트...")
        
        # perceptual hash 계산
        matcher_temp = None
        for item in extracted:
            img_path = item.get("enhanced_path", item["filepath"])
            
            # 해시 계산
            try:
                from PIL import Image
                import numpy as np
                img = Image.open(img_path).convert('L').resize((16, 16), Image.LANCZOS)
                arr = np.array(img)
                avg = arr.mean()
                phash = ''.join(['1' if b else '0' for b in (arr > avg).flatten()])
            except:
                phash = ""
            
            # 파일 해시 (중복 체크용)
            with open(img_path, 'rb') as f:
                file_hash = hashlib.md5(f.read()).hexdigest()
            
            db_entry = {
                "id": f"{subject.upper()[:3]}-{file_hash[:8]}",
                "filename": item["filename"],
                "filepath": item.get("enhanced_path", item["filepath"]),
                "original_path": item["filepath"],
                "source": source_name,
                "subject": subject,
                "page": item.get("page", 0),
                "width": item["width"],
                "height": item["height"],
                "phash": phash,
                "file_hash": file_hash,
                "tags": item.get("tags", {}),
                "added": datetime.now().isoformat(),
            }
            
            # 중복 체크
            existing_hashes = {img["file_hash"] for img in self.index["images"]}
            if file_hash not in existing_hashes:
                self.index["images"].append(db_entry)
                print(f"  [추가] {db_entry['id']}: {item['filename']}")
            else:
                print(f"  [중복] {item['filename']} - 스킵")
        
        # 소스 기록
        self.index["sources"].append({
            "name": source_name,
            "pdf": pdf_path,
            "subject": subject,
            "extracted_count": len(extracted),
            "date": datetime.now().isoformat(),
        })
        
        self.save_index()
        
        print(f"\n{'='*60}")
        print(f"[완료] DB 총 {self.index['total_images']}개 이미지")
        print(f"  저장 위치: {self.db_root}")
        print(f"{'='*60}\n")
    
    def search(self, query_tags=None, subject=None, diagram_type=None):
        """DB 검색"""
        results = self.index["images"]
        
        if subject:
            results = [r for r in results if r.get("subject") == subject]
        
        if diagram_type:
            results = [r for r in results 
                      if diagram_type in r.get("tags", {}).get("diagram_type", "")]
        
        if query_tags:
            results = [r for r in results 
                      if any(tag in str(r.get("tags", {})) for tag in query_tags)]
        
        return results
    
    def stats(self):
        """DB 통계"""
        print(f"\n[다사람 과학 도식 DB 통계]")
        print(f"  총 이미지: {self.index['total_images']}개")
        print(f"  소스: {len(self.index['sources'])}개")
        
        # 과목별 통계
        subjects = {}
        for img in self.index["images"]:
            subj = img.get("subject", "unknown")
            subjects[subj] = subjects.get(subj, 0) + 1
        
        for subj, count in subjects.items():
            name = SCIENCE_CURRICULUM.get(subj, {}).get("name", subj)
            print(f"  {name}: {count}개")


# ============================================================
# CLI
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="다사람 과학 도식 DB 파이프라인")
    subparsers = parser.add_subparsers(dest="command")
    
    # build 명령
    build_parser = subparsers.add_parser("build", help="PDF에서 도식 DB 구축")
    build_parser.add_argument("--pdf", required=True, help="입력 PDF 경로")
    build_parser.add_argument("--subject", default="physics",
                             choices=["physics", "chemistry", "biology", "earth_science"])
    build_parser.add_argument("--source", help="소스 이름 (기본: PDF 파일명)")
    build_parser.add_argument("--auto-tag", action="store_true", help="AI 자동 태깅")
    build_parser.add_argument("--watermark", action="store_true", help="워터마크 추가")
    
    # convert 명령
    convert_parser = subparsers.add_parser("convert", help="시험지 도식 교체")
    convert_parser.add_argument("--input", required=True, help="시험지 이미지/PDF")
    convert_parser.add_argument("--output", required=True, help="출력 파일")
    
    # search 명령
    search_parser = subparsers.add_parser("search", help="DB 검색")
    search_parser.add_argument("--tags", nargs="+", help="검색 태그")
    search_parser.add_argument("--subject", help="과목")
    
    # stats 명령
    subparsers.add_parser("stats", help="DB 통계")
    
    args = parser.parse_args()
    db = ScienceDiagramDB()
    
    if args.command == "build":
        db.build_from_pdf(
            args.pdf, 
            subject=args.subject,
            source_name=args.source,
            auto_tag=getattr(args, 'auto_tag', False),
            add_watermark=args.watermark
        )
    
    elif args.command == "convert":
        converter = ExamConverter(CONFIG["db_root"])
        converter.convert_exam(args.input, args.output)
    
    elif args.command == "search":
        results = db.search(
            query_tags=args.tags,
            subject=args.subject
        )
        for r in results:
            print(f"  [{r['id']}] {r['filename']} - {r.get('tags', {}).get('diagram_type', '미분류')}")
    
    elif args.command == "stats":
        db.stats()
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
