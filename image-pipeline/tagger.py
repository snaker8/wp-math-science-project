"""
AI 메타데이터 태깅 — Claude Sonnet으로 도식 이미지 자동 분류
- 긴 변 1024px 이하로 리사이즈 후 전송 (비용 최적화)
- 단일 태깅 + 배치 태깅 지원
- 과목/단원/도식유형/키워드 자동 분류
"""

import base64
import json
import os
import io
from pathlib import Path

from PIL import Image


_api_key_cache: str = ""

def _get_api_key() -> str:
    """환경변수에서 API 키를 매번 읽어옴 (서버 시작 후 .env 로드 타이밍 대응)"""
    global _api_key_cache
    if _api_key_cache:
        return _api_key_cache
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        # uvicorn reload 시 환경변수 손실 대비: .env 파일 직접 파싱
        for candidate in [
            Path(__file__).resolve().parent.parent / ".env",
            Path.cwd().parent / ".env",
            Path.cwd() / ".env",
        ]:
            if candidate.exists():
                with open(candidate, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("ANTHROPIC_API_KEY="):
                            key = line.split("=", 1)[1].strip().strip('"').strip("'")
                            os.environ["ANTHROPIC_API_KEY"] = key
                            break
                if key:
                    break
    if key:
        _api_key_cache = key
    return key

SONNET_MODEL = "claude-sonnet-4-20250514"

TAGGING_PROMPT = """이 과학/수학 교과서 도식 이미지를 분석해서 아래 JSON 형식으로만 응답해주세요.

## 출력 형식
{
  "subject": "math/physics/chemistry/biology/earth_science 중 하나",
  "grade_level": "중1/중2/중3/고1/고2/고3 중 하나",
  "science_subject": "과목 코드 (아래 단원 체계 참조, 해당 없으면 null)",
  "unit_code": "단원 코드 (아래 단원 체계에서 가장 구체적인 코드 매칭, 해당 없으면 null)",
  "unit_name": "단원명 (unit_code에 대응하는 이름, 해당 없으면 null)",
  "unit_keywords": ["단원 키워드들"],
  "diagram_type": "도식 유형 (예: 이차함수그래프, 회로도, 원자모형, 세포구조도 등)",
  "description": "이 도식이 무엇을 나타내는지 한 줄 설명",
  "labels": ["도식 안에 있는 텍스트 라벨들"],
  "tags": ["검색용 태그 5-10개"]
}

## 2022 개정 교육과정 단원 체계 (unit_code 매칭용)

### 중학교 과학
중1 (MS_SCI): MS1-ME-01 힘과 운동 | MS1-ME-02 에너지 전환과 보존 | MS1-MT-01 물질의 성질 | MS1-MT-02 물질의 상태 변화 | MS1-LF-01 생물의 다양성 | MS1-LF-02 식물과 에너지 | MS1-EU-01 지권의 변화 | MS1-EU-02 대기와 해양
중2 (MS_SCI): MS2-ME-01 전기와 자기 | MS2-ME-02 빛과 파동 | MS2-MT-01 물질의 구성 | MS2-MT-02 화학 반응의 규칙성 | MS2-LF-01 동물과 에너지 | MS2-LF-02 자극과 반응 | MS2-EU-01 태양계 | MS2-EU-02 별과 우주
중3 (MS_SCI): MS3-ME-01 운동과 에너지 | MS3-MT-01 화학 반응에서의 규칙성 | MS3-LF-01 생식과 유전 | MS3-LF-02 생태계와 환경 | MS3-EU-01 기권과 날씨 | MS3-SS-01 과학과 사회

### 통합과학1 (IS1)
IS1-01 과학의 기초: IS1-01-01 물질의 기본 단위 | IS1-01-02 힘과 에너지의 기본 단위
IS1-02 물질과 규칙성: IS1-02-01 우주의 시작과 원소의 생성 | IS1-02-02 원자의 구조와 주기율 | IS1-02-03 화학 결합과 물질의 성질
IS1-03 시스템과 상호작용: IS1-03-01 역학적 시스템 | IS1-03-02 지구 시스템 | IS1-03-03 생명 시스템

### 통합과학2 (IS2)
IS2-01 변화와 다양성: IS2-01-01 화학 변화 | IS2-01-02 생물 다양성과 유지
IS2-02 환경과 에너지: IS2-02-01 생태계와 환경 | IS2-02-02 전기 에너지와 발전
IS2-03 과학과 미래사회: IS2-03-01 감염병과 과학 | IS2-03-02 첨단 과학기술과 미래사회

### 물리학 (PHY)
PHY-01 힘과 에너지 | PHY-02 물질과 전자기장 | PHY-03 파동과 정보통신

### 화학 (CHM)
CHM-01 물질의 구조 | CHM-02 물질의 변화 | CHM-03 화학 변화와 에너지

### 생명과학 (BIO)
BIO-01 생명과학의 이해 | BIO-02 사람의 몸 | BIO-03 항상성과 몸의 조절

### 지구과학 (EAR)
EAR-01 고체 지구 | EAR-02 유체 지구 | EAR-03 우주

### 진로선택
역학과 에너지 (PHY_ME): PHY_ME-01 힘과 운동 | PHY_ME-02 에너지와 열 | PHY_ME-03 시공간과 운동
전자기와 양자 (PHY_EQ): PHY_EQ-01 전자기장 | PHY_EQ-02 양자와 물질
물질과 에너지 (CHM_ME): CHM_ME-01 물질의 화학적 성질 | CHM_ME-02 분자 간 상호작용과 에너지
화학 반응의 세계 (CHM_RW): CHM_RW-01 산 염기와 산화 환원 | CHM_RW-02 반응 속도와 화학 평형 | CHM_RW-03 전기 화학과 화학 에너지
세포와 물질대사 (BIO_CM): BIO_CM-01 세포의 구조와 기능 | BIO_CM-02 세포 호흡과 광합성
생명의 유전 (BIO_GN): BIO_GN-01 유전자와 형질 발현 | BIO_GN-02 유전
지구시스템과학 (EAR_SS): EAR_SS-01 지구 시스템의 에너지 | EAR_SS-02 지구 시스템의 상호작용 | EAR_SS-03 지구의 역사
행성우주과학 (EAR_PS): EAR_PS-01 행성의 운동 | EAR_PS-02 우주의 구조와 진화

## 매칭 규칙
- 가장 구체적인(세부) 단원 코드를 매칭하세요 (예: IS1-02-03이 IS1-02보다 우선)
- 수학 도식은 unit_code/unit_name을 null로 두세요
- 확실하지 않으면 상위 단원 코드를 사용하세요 (예: IS1-02)

JSON만 출력하세요."""


def resize_for_api(image_path: str, max_long_side: int = 1024) -> tuple[bytes, str]:
    """
    API 전송용으로 긴 변 1024px 이하로 리사이즈.
    원본이 이미 작으면 그대로 반환.

    Returns:
        (image_bytes, media_type)
    """
    img = Image.open(image_path)
    w, h = img.size

    if max(w, h) > max_long_side:
        if w > h:
            new_w = max_long_side
            new_h = int(h * max_long_side / w)
        else:
            new_h = max_long_side
            new_w = int(w * max_long_side / h)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    # RGB로 변환 (RGBA, P 등 대응)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def tag_single(image_path: str, api_key: str = "") -> dict:
    """
    단일 이미지를 Claude Sonnet으로 태깅한다.

    Returns:
        태깅 결과 dict 또는 {"error": "..."}
    """
    import anthropic

    key = api_key or _get_api_key()
    if not key:
        return {"error": "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다."}

    client = anthropic.Anthropic(api_key=key)

    img_bytes, media_type = resize_for_api(image_path)
    b64_data = base64.standard_b64encode(img_bytes).decode("utf-8")

    response = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=800,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_data,
                        },
                    },
                    {"type": "text", "text": TAGGING_PROMPT},
                ],
            }
        ],
    )

    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "JSON 파싱 실패", "raw": text}


def tag_batch(image_paths: list[str], api_key: str = "") -> list[dict]:
    """
    여러 이미지를 순차 태깅한다.
    (향후 Anthropic Batch API 연동으로 50% 할인 가능)

    Returns:
        각 이미지의 태깅 결과 리스트
    """
    results = []
    for path in image_paths:
        try:
            result = tag_single(path, api_key=api_key)
            result["_source_path"] = path
            results.append(result)
        except Exception as e:
            results.append({"error": str(e), "_source_path": path})
    return results


def prepare_batch_requests(image_paths: list[str]) -> list[dict]:
    """
    Anthropic Batch API용 요청 목록을 준비한다.
    https://docs.anthropic.com/en/docs/build-with-claude/batch-processing

    Returns:
        Batch API에 제출할 request 목록
    """
    requests = []
    for i, path in enumerate(image_paths):
        img_bytes, media_type = resize_for_api(path)
        b64_data = base64.standard_b64encode(img_bytes).decode("utf-8")

        requests.append(
            {
                "custom_id": f"tag-{i:04d}-{Path(path).stem}",
                "params": {
                    "model": SONNET_MODEL,
                    "max_tokens": 800,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": b64_data,
                                    },
                                },
                                {"type": "text", "text": TAGGING_PROMPT},
                            ],
                        }
                    ],
                },
            }
        )
    return requests


def submit_batch(image_paths: list[str], api_key: str = "") -> dict:
    """
    Anthropic Batch API로 대량 태깅 요청을 제출한다. (50% 할인)

    Returns:
        {"batch_id": str, "count": int} 또는 에러
    """
    import anthropic

    key = api_key or _get_api_key()
    if not key:
        return {"error": "ANTHROPIC_API_KEY 필요"}

    client = anthropic.Anthropic(api_key=key)
    requests = prepare_batch_requests(image_paths)

    batch = client.messages.batches.create(requests=requests)

    return {
        "batch_id": batch.id,
        "count": len(requests),
        "status": batch.processing_status,
    }


def get_batch_results(batch_id: str, api_key: str = "") -> list[dict]:
    """
    Batch API 결과를 조회한다.

    Returns:
        태깅 결과 리스트
    """
    import anthropic

    key = api_key or ANTHROPIC_API_KEY
    client = anthropic.Anthropic(api_key=key)

    results = []
    for result in client.messages.batches.results(batch_id):
        if result.result.type == "succeeded":
            text = result.result.message.content[0].text.strip()
            text = text.replace("```json", "").replace("```", "").strip()
            try:
                parsed = json.loads(text)
                parsed["_custom_id"] = result.custom_id
                results.append(parsed)
            except json.JSONDecodeError:
                results.append(
                    {"error": "JSON 파싱 실패", "raw": text, "_custom_id": result.custom_id}
                )
        else:
            results.append(
                {"error": f"실패: {result.result.type}", "_custom_id": result.custom_id}
            )

    return results
