// ============================================================================
// 사전 심볼 탐지 게이트 (2026-05-27 단계 C MVP):
//
// 자산화 시 Mathpix OCR 가 동그라미 한글 (㉠ ㉡ ㉢ ㉣ ㉤) 같은 닫힌 유한 기호를
// (ㄱ) (ㄴ) (ㄷ) (ㄹ) (ㅁ) 로 잘못 인식하는 사고가 반복. 단순 치환은 원본이 진짜
// (ㄱ) 인 시험지를 깰 위험. → 원본 크롭을 Gemini Flash 로 보고 실제 기호 판별 후
// 불일치만 교정 = **원본 클론 보장**.
//
// 흐름:
//   1) Mathpix OCR 결과 (ocrText) 에 의심 패턴 사전 필터 — 없으면 비용 0
//   2) 의심 있으면 cropImageUrl → Gemini Flash 호출 (닫힌 기호 5종 탐지 JSON)
//   3) Mathpix `(ㄱ)` + Flash `㉠` 동시 탐지 시에만 교정
//   4) 한쪽만 있거나 둘 다 없으면 변환 X (원본 보호)
//
// 비용:
//   - 의심 패턴 없는 문제 = 0 API call
//   - 의심 패턴 있는 문제 = 1 Flash call (~$0.0001, <1s)
//   - 25문항 시험지 평균 = 5~10 호출 = $0.001 미만
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

// 동그라미 한글 매핑 (ㄱ~ㅊ → ㉠~㉩)
const SYMBOL_MAP_KOREAN: Array<{ jamo: string; circled: string }> = [
  { jamo: 'ㄱ', circled: '㉠' },
  { jamo: 'ㄴ', circled: '㉡' },
  { jamo: 'ㄷ', circled: '㉢' },
  { jamo: 'ㄹ', circled: '㉣' },
  { jamo: 'ㅁ', circled: '㉤' },
  { jamo: 'ㅂ', circled: '㉥' },
  { jamo: 'ㅅ', circled: '㉦' },
  { jamo: 'ㅇ', circled: '㉧' },
  { jamo: 'ㅈ', circled: '㉨' },
  { jamo: 'ㅊ', circled: '㉩' },
];

// 의심 패턴 — 이 중 하나라도 ocrText 에 있어야 Flash 호출
const SUSPICIOUS_REGEX = new RegExp(
  SYMBOL_MAP_KOREAN.map(({ jamo }) => `\\(\\s*${jamo}\\s*\\)`).join('|'),
  'g'
);

export interface SymbolDetectionResult {
  repairedText: string;
  repairCount: number;
  detected: string[];
  /** 호출 발생 여부 (사전 필터 통과 시 true) */
  flashCalled: boolean;
}

/**
 * Mathpix OCR 결과 + 원본 크롭 → 사전 심볼 탐지 게이트.
 *
 * 1. 의심 패턴 사전 필터 — `(ㄱ)~(ㅁ)` 없으면 즉시 반환 (비용 0)
 * 2. Flash 호출 — 크롭에서 실제 동그라미 한글 보이는지 탐지
 * 3. Mathpix `(ㄱ)` + Flash `㉠` 동시 검출 시에만 변환 (원본 클론 보장)
 *
 * 실패 시 (네트워크/API 에러) 원본 그대로 반환 — fail-safe.
 */
export async function detectAndRepairSymbols(
  cropImageUrl: string | null | undefined,
  ocrText: string
): Promise<SymbolDetectionResult> {
  // 1) 사전 필터
  if (!ocrText || !SUSPICIOUS_REGEX.test(ocrText)) {
    return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: false };
  }
  // regex /g 사용 시 lastIndex 누적되므로 reset
  SUSPICIOUS_REGEX.lastIndex = 0;

  if (!cropImageUrl || !GEMINI_API_KEY) {
    return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: false };
  }

  // 2) 크롭 이미지 fetch + base64
  let imageBase64: string;
  let mimeType = 'image/png';
  try {
    const imgRes = await fetch(cropImageUrl);
    if (!imgRes.ok) {
      return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: false };
    }
    const contentType = imgRes.headers.get('content-type');
    if (contentType?.startsWith('image/')) mimeType = contentType;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    imageBase64 = buffer.toString('base64');
  } catch (e) {
    console.warn('[symbol-detector] 크롭 fetch 실패:', e instanceof Error ? e.message : e);
    return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: false };
  }

  // 3) Gemini Flash 호출 — 닫힌 기호 5종 탐지 (현재 동그라미 한글만, MVP)
  const prompt = `이 시험 문제 이미지에서 동그라미 한글 보기 라벨 (㉠ ㉡ ㉢ ㉣ ㉤ ㉥ ㉦ ㉧ ㉨ ㉩) 중 명확히 보이는 것만 JSON 으로 응답.

응답 형식 (JSON only, 다른 설명 X):
{"symbols": ["㉠", "㉡", "㉢"]}

규칙:
- 동그라미 안 한글 (㉠ ㉡ ...) 만 포함
- 괄호 안 한글 ((ㄱ) (ㄴ) ...) 은 포함 X — 동그라미 아니면 제외
- 의심스러우면 제외 (정확도 우선)
- 이미지에 없으면 {"symbols": []}`;

  const model = process.env.GEMINI_SYMBOL_MODEL || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  let detected: string[] = [];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType } },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });
    if (!res.ok) {
      console.warn('[symbol-detector] Flash HTTP', res.status);
      return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: true };
    }
    const data = await res.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*?"symbols"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.symbols)) {
          detected = parsed.symbols.filter((s: unknown) => typeof s === 'string');
        }
      } catch {
        // JSON 파싱 실패 — 변환 안 함
      }
    }
  } catch (e) {
    console.warn('[symbol-detector] Flash 호출 실패:', e instanceof Error ? e.message : e);
    return { repairedText: ocrText, repairCount: 0, detected: [], flashCalled: true };
  }

  // 4) 비교 — Mathpix `(ㄱ)` + Flash `㉠` 동시 탐지 시에만 교정
  let repairedText = ocrText;
  let repairCount = 0;
  for (const { jamo, circled } of SYMBOL_MAP_KOREAN) {
    const ocrPattern = new RegExp(`\\(\\s*${jamo}\\s*\\)`, 'g');
    if (ocrPattern.test(repairedText) && detected.includes(circled)) {
      const matches = repairedText.match(ocrPattern);
      const count = matches?.length ?? 0;
      if (count > 0) {
        repairedText = repairedText.replace(ocrPattern, circled);
        repairCount += count;
      }
    }
  }

  if (repairCount > 0) {
    console.log(
      `[symbol-detector] ${repairCount}건 교정 (Flash 탐지: ${detected.join(',') || '없음'})`
    );
  }

  return { repairedText, repairCount, detected, flashCalled: true };
}
