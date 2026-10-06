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
  // ★ 동그라미 음절 (2026-10-06 해운대여중 #4: 지도 위 항구 ㉮㉯㉰ 를 "(ㄹ), (ㅂ), 다)" 로 읽음) — OCR 은 "(가)" "가)" 로 벗긴다
  { jamo: '가', circled: '㉮' },
  { jamo: '나', circled: '㉯' },
  { jamo: '다', circled: '㉰' },
  { jamo: '라', circled: '㉱' },
  { jamo: '마', circled: '㉲' },
  { jamo: '바', circled: '㉳' },
  { jamo: '사', circled: '㉴' },
  { jamo: '아', circled: '㉵' },
  { jamo: '자', circled: '㉶' },
  { jamo: '차', circled: '㉷' },
];

// ★ Mathpix 가 ㉠ 을 내보내는 꼴 3가지 (2026-09-22, 학장중 24-2-2-M #7 증명 박스 실측):
//   `(ㄱ)` · `(ㄱ.` (닫는 괄호 대신 점) · `(ㄱ` 뒤에 공백/한글 (괄호가 안 닫힘).
//   종전엔 `(ㄱ)` 만 봐서 `(ㄱ.~(ㅁ.에 들어갈` 은 의심 패턴에도 안 걸려 Flash 를 부르지도 않았다.
export function jamoOcrPattern(jamo: string, flags = 'g'): RegExp {
  return new RegExp(`\\(\\s*${jamo}\\s*(?:\\)|\\.|(?=[\\s가-힣~〜]))`, flags);
}

// ★ 화살표 사슬(작도 순서 보기 `㉠ → ㉡ → ㉢`, 2026-10-06 대표 캡처): Mathpix 가 동그라미를 벗겨 `ㄱ → ㄴ → ㄷ` 로,
//   때로 `ς`(ㅁ 오인식)·`(ㄱ.` 로 낸다. 사슬 안의 맨몸 자모는 보기 라벨(ㄱ. ㄴ.)이 아니라 동그라미 한글이다.
//   사슬 = `→` 가 들어간 줄. 그 줄 안에서 `→`/줄 시작/`(`/공백 사이의 자모 하나.
const ARROW_CHAIN_LINE = /^[^\n]*→[^\n]*$/gm;
export function jamoChainPattern(jamo: string): RegExp {
  // lead(줄 시작·공백·→)는 보존하고 여는 `(` 와 뒤 `.` 만 떼어 낸다 — 공백까지 먹으면 `㉠→㉡` 로 붙어 버린다
  return new RegExp(`(^|\\s|→)\\(?${jamo}\\.?(?=\\s*(?:→|$|[),.]))`, 'g');
}

// 의심 패턴 — 이 중 하나라도 ocrText 에 있어야 Flash 호출
const SUSPICIOUS_REGEX = new RegExp(
  SYMBOL_MAP_KOREAN.map(({ jamo }) => jamoOcrPattern(jamo, '').source).join('|')
    + '|→[^\\n]*[ㄱㄴㄷㄹㅁς]|[ㄱㄴㄷㄹㅁς][^\\n]*→'
    // ★ 2026-10-06 해운대여중 #4: ㉰ 가 "다)" 로 — 괄호 없이 음절 하나 + ')' (앞에 '(' 나 글자가 없을 때만)
    + '|(?<![(\\w가-힣])[가나다라마바사아자차]\\)',
  'g'
);

/**
 * 순수 교정 — Flash 가 본 동그라미 한글(detected)에 대해서만 Mathpix 꼴을 ㉠ 로 바꾼다.
 * 빈칸 `□`(U+25A1) 은 라벨과 붙어 있으면 `\boxed{㉢}`, 홀로면 `\boxed{\ \ }` — 증명 박스의 빈칸 표현.
 */
export function repairCircledJamoText(ocrText: string, detected: string[]): { repairedText: string; repairCount: number } {
  let repairedText = ocrText;
  let repairCount = 0;
  for (const { jamo, circled } of SYMBOL_MAP_KOREAN) {
    if (!detected.includes(circled)) continue;
    const ocrPattern = jamoOcrPattern(jamo);
    const count = (repairedText.match(ocrPattern) || []).length;
    if (count > 0) {
      repairedText = repairedText.replace(ocrPattern, circled);
      repairCount += count;
    }
  }
  // ★ 화살표 사슬 안의 맨몸 자모 (+ ς 는 ㉤ 오인식) — Flash 가 본 기호만
  repairedText = repairedText.replace(ARROW_CHAIN_LINE, (line) => {
    let out = line;
    for (const { jamo, circled } of SYMBOL_MAP_KOREAN) {
      if (!detected.includes(circled)) continue;
      out = out.replace(jamoChainPattern(jamo), (_m, lead: string) => { repairCount++; return `${lead}${circled}`; });
    }
    if (detected.includes('㉤')) {
      out = out.replace(/(^|\s|→)\(?ς\.?(?=\s*(?:→|$|[),.]))/g, (_m, lead: string) => { repairCount++; return `${lead}㉤`; });
    }
    return out;
  });
  // ★ 순서 대응 폴백 (2026-10-06 해운대여중 #4): OCR 이 ㉠㉡㉢ 을 "(ㄹ), (ㅂ), 다)" 처럼 **글자 자체를 틀리게** 읽으면
  //   위의 글자 대응(ㄱ→㉠)으로는 못 잡는다. Flash 가 본 기호 중 아직 본문에 없는 것과, 본문에 남은 "자모/음절 토큰"의 개수가
  //   같으면 등장 순서대로 대응시킨다. 개수가 다르면 건드리지 않는다(원본 보호).
  const missing = SYMBOL_MAP_KOREAN.map((m) => m.circled).filter((c) => detected.includes(c) && !repairedText.includes(c));
  if (missing.length > 0) {
    const hasSyllable = missing.some((c) => c >= '㉮' && c <= '㉷');
    const tokenRe = hasSyllable
      ? /\(\s*[ㄱ-ㅎ]\s*[).]|\(\s*[ㄱ-ㅎ](?=[\s가-힣,~〜])|\(\s*[가나다라마바사아자차]\s*[).]|(?<![(\w가-힣])[가나다라마바사아자차]\)/g
      : /\(\s*[ㄱ-ㅎ]\s*[).]|\(\s*[ㄱ-ㅎ](?=[\s가-힣,~〜])|(?<![(\w가-힣])[가나다라마바사아자차]\)/g;
    const tokens = [...repairedText.matchAll(tokenRe)];
    if (tokens.length === missing.length) {
      let out = ''; let last = 0;
      tokens.forEach((m, i) => { out += repairedText.slice(last, m.index) + missing[i]; last = (m.index as number) + m[0].length; });
      repairedText = out + repairedText.slice(last);
      repairCount += tokens.length;
    }
  }
  if (repairCount > 0 && /□/.test(repairedText)) {
    repairedText = repairedText
      .replace(/□\s*([㉠-㉷])/g, '\\boxed{$1}')
      .replace(/([㉠-㉷])\s*□/g, '\\boxed{$1}')
      .replace(/□/g, '\\boxed{\\ \\ }');
  }
  return { repairedText, repairCount };
}

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
  // ★ data URL 도 받는다 (재분석 「텍스트 읽어내기」는 크롭을 base64 로 들고 있다, 2026-10-06)
  const dataUrlMatch = cropImageUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    imageBase64 = dataUrlMatch[2];
  } else {
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
  }

  // 3) Gemini Flash 호출 — 닫힌 기호 5종 탐지 (현재 동그라미 한글만, MVP)
  const prompt = `이 시험 문제 이미지에서 동그라미 안에 한글이 든 라벨 중 명확히 보이는 것만 JSON 으로 응답.
대상 두 종류:
- 동그라미 자모: ㉠ ㉡ ㉢ ㉣ ㉤ ㉥ ㉦ ㉧ ㉨ ㉩
- 동그라미 음절: ㉮(가) ㉯(나) ㉰(다) ㉱(라) ㉲(마) ㉳(바) ㉴(사) ㉵(아) ㉶(자) ㉷(차)

응답 형식 (JSON only, 다른 설명 X):
{"symbols": ["㉮", "㉯", "㉰"]}

규칙:
- 동그라미 안 한글만 포함. 자모(ㄱ)인지 음절(가)인지 정확히 구분해 해당 문자로 적는다
- 괄호 안 한글 ((ㄱ) (가) ...) 은 포함 X — 동그라미 아니면 제외
- 본문·그림(지도 등) 어디에 있든 포함
- 의심스러우면 제외 (정확도 우선)
- 이미지에 없으면 {"symbols": []}`;

  const model = process.env.GEMINI_SYMBOL_MODEL || 'gemini-3.8-flash';
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

  // 4) 비교 — Mathpix `(ㄱ)`/`(ㄱ.`/`(ㄱ ` + Flash `㉠` 동시 탐지 시에만 교정 (순수 함수, 회귀 테스트)
  const { repairedText, repairCount } = repairCircledJamoText(ocrText, detected);

  if (repairCount > 0) {
    console.log(
      `[symbol-detector] ${repairCount}건 교정 (Flash 탐지: ${detected.join(',') || '없음'})`
    );
  }

  return { repairedText, repairCount, detected, flashCalled: true };
}
