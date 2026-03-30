# 다사람 이미지 처리 파이프라인 통합 작업 지시서
## Claude Code에서 기존 수학 프로그램에 통합할 내용

---

## 1. 프로젝트 개요

### 목적
기존 다사람수학 자산화 프로그램에 **이미지 처리 파이프라인**을 추가한다.
수학/과학 문제에 포함된 도식, 그래프, 삽화 이미지를 자동으로 추출하고,
고화질로 보정하여 DB에 저장하고, 시험지 자산화 시 저화질 이미지를 고화질로 자동 교체한다.

### 적용 범위
- **수학**: 그래프, 도형, 좌표평면, 수직선, 넓이/부피 도식 등
- **과학**: 실험 장치도, 원자 모형, 회로도, 세포 구조, 지층 단면, 태양계 도식 등

### 핵심 흐름
```
[원본 소스 (교과서/문제집 HWP·PDF)]
    ↓
[이미지 자동 추출] → HWP 파서 / PDF 파서
    ↓
[해상도 체크] → 기준 미달 시 AI 업스케일
    ↓
[이미지 보정] → 배경 정리, 샤프닝, 노이즈 제거
    ↓
[AI 메타데이터 태깅] → 과목/단원/도식유형/키워드 자동 분류
    ↓
[DB 저장] → 이미지 파일 + JSON 메타데이터 + perceptual hash
    ↓
[시험지 자산화 시] → 저화질 도식 감지 → DB 매칭 → 고화질 교체
```

---

## 2. 추가할 모듈 목록

### 모듈 A: HWP 이미지 추출기 (`hwp_image_extractor.py`)

HWP 5.0 파일(OLE2 compound document)에서 BinData 스트림의 이미지를 직접 추출한다.

**핵심 로직:**
```python
# HWP는 OLE2 형식. BinData 스트림 안에 이미지가 zlib 압축으로 저장됨
# 1. OLE2 헤더 파싱 → FAT 체인 읽기 → 디렉토리 엔트리 탐색
# 2. "BIN0001.bmp", "BIN0002.png" 등 BinData 스트림 찾기
# 3. zlib 압축 해제 (wbits=-15)
# 4. PIL로 이미지 변환 및 PNG 저장
```

**구현 포인트:**
- `olefile` 패키지 사용 권장 (없으면 수동 OLE2 파싱)
- HWP의 BinData는 zlib 압축됨 → `zlib.decompress(data, -15)` 시도
- 최소 크기 필터링: 100x100 미만 이미지 스킵 (아이콘, 장식 제외)
- 추출 결과: `{ filename, filepath, width, height, format, page_hint }`

**테스트 완료된 코드 (실제 동작 확인됨):**
```python
import struct, zlib, io, os
from PIL import Image

class HWPImageExtractor:
    """HWP 5.0 파일에서 임베디드 이미지 추출"""
    
    def __init__(self, hwp_path):
        with open(hwp_path, 'rb') as f:
            self.data = f.read()
        # OLE2 magic check
        assert self.data[:4] == b'\xd0\xcf\x11\xe0', "Not an OLE2 file"
        self._parse_header()
    
    def _parse_header(self):
        header = self.data[:512]
        self.sector_size = 1 << struct.unpack('<H', header[30:32])[0]
        self.fat = []
        difat = []
        for i in range(109):
            sid = struct.unpack('<I', header[76 + i*4:80 + i*4])[0]
            if sid != 0xFFFFFFFF and sid != 0xFFFFFFFE:
                difat.append(sid)
        for sid in difat:
            offset = 512 + sid * self.sector_size
            for i in range(self.sector_size // 4):
                val = struct.unpack('<I', self.data[offset + i*4:offset + i*4 + 4])[0]
                self.fat.append(val)
        self.dir_start = struct.unpack('<I', header[48:52])[0]
    
    def _read_chain(self, start_sid, max_size=None):
        chain_data = bytearray()
        sid = start_sid
        visited = set()
        while sid != 0xFFFFFFFE and sid != 0xFFFFFFFF and sid < len(self.fat):
            if sid in visited:
                break
            visited.add(sid)
            offset = 512 + sid * self.sector_size
            chain_data.extend(self.data[offset:offset + self.sector_size])
            if max_size and len(chain_data) >= max_size:
                break
            sid = self.fat[sid]
        return bytes(chain_data[:max_size]) if max_size else bytes(chain_data)
    
    def _get_entries(self):
        dir_data = self._read_chain(self.dir_start)
        entries = []
        for i in range(0, len(dir_data), 128):
            entry = dir_data[i:i+128]
            if len(entry) < 128:
                break
            name_len = struct.unpack('<H', entry[64:66])[0]
            if name_len == 0:
                continue
            name = entry[:name_len].decode('utf-16-le', errors='ignore').rstrip('\x00')
            entry_type = entry[66]
            start_sid = struct.unpack('<I', entry[116:120])[0]
            size = struct.unpack('<I', entry[120:124])[0]
            if entry_type == 2:
                entries.append({'name': name, 'start': start_sid, 'size': size})
        return entries
    
    def extract_images(self, output_dir, min_size=(100, 100)):
        """모든 이미지를 추출하여 output_dir에 저장"""
        os.makedirs(output_dir, exist_ok=True)
        results = []
        
        for entry in self._get_entries():
            if not entry['name'].startswith('BIN'):
                continue
            
            raw = self._read_chain(entry['start'], entry['size'])
            
            # zlib 압축 해제 시도
            try:
                img_data = zlib.decompress(raw, -15)
            except:
                img_data = raw
            
            # 이미지 변환
            try:
                img = Image.open(io.BytesIO(img_data))
                w, h = img.size
                
                if w < min_size[0] or h < min_size[1]:
                    continue
                
                out_name = entry['name'].rsplit('.', 1)[0] + '.png'
                out_path = os.path.join(output_dir, out_name)
                img.save(out_path, 'PNG')
                
                results.append({
                    'filename': out_name,
                    'filepath': out_path,
                    'original_name': entry['name'],
                    'width': w,
                    'height': h,
                    'mode': img.mode,
                })
            except:
                continue
        
        return results
```

---

### 모듈 B: PDF 이미지 추출기 (`pdf_image_extractor.py`)

PDF에서 임베디드 이미지를 원본 해상도로 추출한다.

**구현 포인트:**
- PyMuPDF(fitz) 사용 권장 → `page.get_images()` → `doc.extract_image(xref)`
- PyMuPDF 없으면 poppler의 `pdfimages -all` 명령으로 대안
- PPM → PNG 자동 변환
- 최소 크기 필터링 동일

**핵심 코드:**
```python
import fitz  # PyMuPDF

def extract_from_pdf(pdf_path, output_dir, min_size=(100, 100)):
    doc = fitz.open(pdf_path)
    results = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        for img_idx, img_info in enumerate(page.get_images(full=True)):
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            if not base_image:
                continue
            
            w, h = base_image["width"], base_image["height"]
            if w < min_size[0] or h < min_size[1]:
                continue
            
            filename = f"page{page_num+1:03d}_img{img_idx+1:02d}.{base_image['ext']}"
            filepath = os.path.join(output_dir, filename)
            
            with open(filepath, "wb") as f:
                f.write(base_image["image"])
            
            results.append({
                'filename': filename,
                'filepath': filepath,
                'page': page_num + 1,
                'width': w,
                'height': h,
            })
    
    doc.close()
    return results
```

---

### 모듈 C: 이미지 보정기 (`image_enhancer.py`)

추출된 이미지를 인쇄 품질로 보정한다.

**처리 단계:**
1. 해상도 체크 → 짧은 변 기준 600px 미만이면 업스케일 대상
2. LANCZOS 업스케일 (2~4배) → 이건 기본 보정
3. AI 업스케일 (선택) → Real-ESRGAN 또는 Upscayl CLI 연동
4. 배경 평탄화 (그레이스케일 도식인 경우)
5. UnsharpMask 샤프닝
6. 노이즈 제거 (밝은 픽셀 흰색화)
7. 300 DPI로 저장

**핵심 코드:**
```python
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

class ImageEnhancer:
    MIN_SHORT_SIDE = 600  # 이 미만이면 업스케일
    
    @staticmethod
    def enhance(image_path, output_path=None, target_short_side=600):
        img = Image.open(image_path)
        w, h = img.size
        short_side = min(w, h)
        
        # 1. 필요시 업스케일
        if short_side < target_short_side:
            scale = max(2, target_short_side // short_side + 1)
            img = img.resize((w * scale, h * scale), Image.LANCZOS)
        
        # 2. 샤프닝
        img = ImageEnhance.Sharpness(img).enhance(1.4)
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
        
        # 3. 대비 미세 조정
        img = ImageEnhance.Contrast(img).enhance(1.1)
        
        # 4. 노이즈 정리 (선택: 흑백 도식일 경우)
        arr = np.array(img)
        if len(arr.shape) == 2:  # 그레이스케일
            arr[arr > 230] = 255
            img = Image.fromarray(arr)
        
        # 5. 저장
        if output_path is None:
            output_path = image_path
        img.save(output_path, dpi=(300, 300), quality=95)
        return output_path
```

**AI 업스케일 연동 (선택사항):**
```python
import subprocess

def upscale_with_realesrgan(input_path, output_path, scale=4):
    """Real-ESRGAN CLI 연동"""
    subprocess.run([
        "realesrgan-ncnn-vulkan",
        "-i", input_path,
        "-o", output_path,
        "-s", str(scale),
        "-n", "realesrgan-x4plus"
    ])

def upscale_with_upscayl(input_path, output_path, scale=4):
    """Upscayl CLI 연동"""
    subprocess.run([
        "upscayl-cli",
        "-i", input_path,
        "-o", output_path,
        "-s", str(scale),
    ])
```

---

### 모듈 D: AI 메타데이터 태깅 (`diagram_tagger.py`)

Claude API로 도식 이미지의 과목/단원/키워드를 자동 분류한다.

**구현 포인트:**
- 이미지를 base64로 인코딩 → Claude API에 전송
- JSON 형식으로 응답 받아 파싱
- 태그: subject, grade_level, unit_keywords, diagram_type, description, labels, tags

**프롬프트:**
```
이 과학/수학 교과서 도식 이미지를 분석해서 아래 JSON 형식으로만 응답해주세요.
{
  "subject": "math/physics/chemistry/biology/earth_science 중 하나",
  "grade_level": "중1/중2/중3/고1/고2/고3 중 하나",
  "unit_keywords": ["단원 키워드들"],
  "diagram_type": "도식 유형 (예: 이차함수그래프, 회로도, 원자모형 등)",
  "description": "이 도식이 무엇을 나타내는지 한 줄 설명",
  "labels": ["도식 안에 있는 텍스트 라벨들"],
  "tags": ["검색용 태그 5-10개"]
}
```

**비용 최적화:**
- Sonnet 사용 (Opus 불필요)
- 이미지 리사이즈 후 전송 (긴 변 1024px 이하로)
- 배치 API 활용 시 50% 할인

---

### 모듈 E: 이미지 매칭 엔진 (`image_matcher.py`)

시험지의 저화질 도식을 DB의 고화질 원본과 매칭한다.

**매칭 방법 (2단계):**
1. **Perceptual Hash**: 빠른 1차 필터링 (해밍 거리 기준)
2. **AI 정밀 매칭**: 해시 후보가 여러 개일 때 Claude에게 판단 요청

**Perceptual Hash 구현:**
```python
from PIL import Image
import numpy as np

def compute_phash(image_path, hash_size=16):
    img = Image.open(image_path).convert('L').resize((hash_size, hash_size), Image.LANCZOS)
    arr = np.array(img)
    avg = arr.mean()
    return ''.join(['1' if b else '0' for b in (arr > avg).flatten()])

def hamming_distance(hash1, hash2):
    return sum(c1 != c2 for c1, c2 in zip(hash1, hash2))

def find_match(query_path, db_index, threshold=40):
    query_hash = compute_phash(query_path)
    best = None
    best_dist = float('inf')
    
    for item in db_index["images"]:
        dist = hamming_distance(query_hash, item["phash"])
        if dist < best_dist:
            best_dist = dist
            best = item
    
    if best and best_dist < threshold:
        return {"matched": True, "distance": best_dist, "db_image": best}
    return {"matched": False}
```

---

### 모듈 F: DB 인덱스 관리 (`diagram_db.py`)

이미지 파일 + JSON 메타데이터 + 인덱스를 관리한다.

**디렉토리 구조:**
```
dasaram_db/
├── images/
│   ├── physics/
│   │   ├── 비상_물리1/
│   │   │   ├── page001_img01.png
│   │   │   ├── page001_img01_enhanced.png
│   │   │   └── ...
│   │   └── 천재_물리2/
│   ├── chemistry/
│   ├── biology/
│   ├── earth_science/
│   └── math/
├── metadata/
│   ├── PHY-a1b2c3d4.json
│   └── ...
└── index.json
```

**index.json 구조:**
```json
{
  "version": "1.0",
  "total_images": 1523,
  "images": [
    {
      "id": "PHY-a1b2c3d4",
      "filename": "page012_img02_enhanced.png",
      "filepath": "images/physics/비상_물리1/page012_img02_enhanced.png",
      "source": "비상_물리1",
      "subject": "physics",
      "width": 1074,
      "height": 381,
      "phash": "110100101...",
      "file_hash": "a1b2c3d4e5f6...",
      "tags": {
        "subject": "physics",
        "diagram_type": "원자모형",
        "grade_level": "고1",
        "tags": ["이온", "전자배치", "양성자"]
      }
    }
  ]
}
```

---

## 3. 기존 코드베이스 통합 방법

### 기존 파이프라인에 추가할 위치

```
[기존] 문제 스캔/캡쳐 → Mathpix OCR → 텍스트/수식 인식 → DB 저장
                                ↓
[추가] 이미지 영역 감지 → 이미지 추출 → DB 매칭 → 고화질 교체
                                                    ↓
[추가]                              매칭 실패 시 → 업스케일 보정 → DB에 신규 등록
```

### 과목 확장

기존 `subject` 필드에 과학 과목 코드 추가:
- `math` (기존)
- `physics`, `chemistry`, `biology`, `earth_science` (신규)

기존 교육과정 매핑 테이블에 과학 단원 추가 (2015/2022 개정).

---

## 4. 필요 패키지

```bash
# 필수
pip install Pillow numpy

# PDF 처리
pip install PyMuPDF  # fitz

# HWP 처리 (선택: olefile 사용 시)
pip install olefile

# AI 태깅
pip install anthropic  # 이미 설치되어 있을 것

# AI 업스케일 (선택)
# Real-ESRGAN: https://github.com/xinntao/Real-ESRGAN
# Upscayl CLI: https://github.com/upscayl/upscayl
```

---

## 5. 구현 우선순위

### Phase 1: 즉시 (1~2일)
- [ ] HWP 이미지 추출기 모듈 추가
- [ ] PDF 이미지 추출기 모듈 추가
- [ ] 이미지 보정기 모듈 추가 (LANCZOS + 샤프닝)
- [ ] DB 인덱스 관리 모듈 추가

### Phase 2: 단기 (3~5일)
- [ ] AI 메타데이터 태깅 연동 (Claude API)
- [ ] Perceptual Hash 기반 이미지 매칭
- [ ] 기존 자산화 파이프라인에 이미지 교체 로직 통합

### Phase 3: 중기 (1~2주)
- [ ] AI 업스케일 연동 (Real-ESRGAN 또는 Upscayl)
- [ ] 시험지 업로드 시 도식 자동 감지 + DB 매칭 + 교체 자동화
- [ ] 과학 교육과정 단원 분류 체계 완성

### Phase 4: 장기 (1개월~)
- [ ] 교과서/문제집 원본 PDF에서 대량 이미지 추출 → DB 구축
- [ ] SVG 벡터 도식 라이브러리 구축 (빈출 50개부터)
- [ ] 워터마크/브랜딩 자동 삽입

---

## 6. 테스트 데이터

오늘 실제 테스트한 파일:
- `밀착문제_비상교육__Ⅰ-1_물질의_규칙성과_결합_.hwp`
- 추출 결과: 9개 BinData 중 7개 이미지 성공 추출
- 포함 도식: 태양계 형성 과정(가나다라), 원자 모형(1+,3+,8+), 이온 모형(17+,12+,17+), 빅뱅 이미지, NaCl 결정 구조
- 원본 해상도: 112x74 ~ 358x127 (저해상도 → 3x 업스케일 적용)

---

## 7. 참고사항

- HWP 5.0 파일은 OLE2 compound document 형식 (Microsoft CFB)
- BinData 스트림은 zlib 압축 (wbits=-15)
- 교과서 원본 PDF의 이미지는 HWP보다 3~5배 고해상도
- 디지털교과서, e-book PDF가 최고 품질 소스
- 이미지 매칭은 perceptual hash로 1차 필터 → AI로 2차 정밀 매칭
- 수학 그래프는 수식 인식 후 코드로 재생성이 가능 (Matplotlib/SVG)
- 과학 도식은 이미지 DB 매칭 + 교체 방식이 현실적
