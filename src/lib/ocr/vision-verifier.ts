// ============================================================================
// 비전 검증 + 자동 교정 (2026-05-27 단계 3 full 루프):
//
// 사용자 의도: "원본 크롭 vs 자산화 분석 결과 다르면 자동 수정 루프 완성".
//
// 흐름 (자산화 시 모든 문제):
//   1) 원본 크롭 + OCR LaTeX → Gemini Flash 비전 대조
//   2) 일치하면 통과 (대부분 케이스)
//   3) 불일치 시 corrected LaTeX 받아 본문 교체
//   4) 교정 diff 누적 (latex_render_corrections) — 다음 자산화 결정론적 룰 자동 적용 회로
//
// 원본 클론 보장:
//   - prompt 가 매우 보수적 — 확신 없으면 match:true 반환
//   - 원본이 진짜 (ㄱ) 이면 corrected X (사용자 강조한 클론 원칙)
//   - 수학식·도형 마커는 OCR 결과 유지
//
// 비용 (Gemini Flash 기준):
//   - 자산화당 모든 문제 1회 호출 = 25문항 × ~$0.001 = ~$0.025/시험지
//   - 응답 <2s/문제 = 25문항 약 50s 추가 시간 (병렬화 가능)
//
// Fail-safe: 어느 단계든 실패하면 원본 OCR 결과 그대로 반환.
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

export interface VisionVerificationResult {
  /** 원본과 OCR 결과가 일치하는가 */
  isMatch: boolean;
  /** 불일치 시 교정된 LaTeX (일치 시 null) */
  correctedText: string | null;
  /** 교정 diff 목록 (학습 누적용) */
  diffs: Array<{ from: string; to: string }>;
  /** Flash 호출 발생 여부 (필터링 통과 시 true) */
  flashCalled: boolean;
}

/**
 * 원본 크롭 + OCR LaTeX → 비전 모델 대조 + 교정.
 *
 * 매우 보수적 prompt — match:true 가 default. 명확한 OCR 오인식만 교정.
 * 사용자 클론 원칙: 원본이 진짜 (ㄱ) 이면 ㉠ 으로 변환 X.
 *
 * @param cropImageUrl 원본 문제 크롭 이미지 URL (Supabase Storage)
 * @param ocrLatex Mathpix/Gemini OCR 결과 LaTeX
 * @returns 검증 결과 + 교정 (필요 시)
 */
export async function verifyAndRepairWithVision(
  cropImageUrl: string | null | undefined,
  ocrLatex: string
): Promise<VisionVerificationResult> {
  if (!ocrLatex || !cropImageUrl || !GEMINI_API_KEY) {
    return { isMatch: true, correctedText: null, diffs: [], flashCalled: false };
  }

  // 1) 크롭 이미지 fetch + base64
  let imageBase64: string;
  let mimeType = 'image/png';
  try {
    const imgRes = await fetch(cropImageUrl);
    if (!imgRes.ok) {
      return { isMatch: true, correctedText: null, diffs: [], flashCalled: false };
    }
    const contentType = imgRes.headers.get('content-type');
    if (contentType?.startsWith('image/')) mimeType = contentType;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    imageBase64 = buffer.toString('base64');
  } catch (e) {
    console.warn('[vision-verifier] 크롭 fetch 실패:', e instanceof Error ? e.message : e);
    return { isMatch: true, correctedText: null, diffs: [], flashCalled: false };
  }

  // 2) Gemini Flash 비전 대조 — 보수적 prompt
  const prompt = `이 시험 문제 이미지와 아래 OCR 결과 LaTeX 를 비교.

OCR 결과:
\`\`\`
${ocrLatex}
\`\`\`

작업: 원본 이미지를 정답으로 — OCR 가 명확히 잘못 인식한 부분만 원본 기준으로 수정.

응답 형식 (JSON only, 다른 설명 X):
- 일치하거나 의심스러우면: {"match": true}
- 명확히 다르면: {"match": false, "corrected": "<수정된 LaTeX 전체>", "diffs": [{"from": "OCR 원본 토큰", "to": "원본 이미지 토큰"}]}

★ 클론 원칙 (필수 준수):
1. 원본 이미지가 진짜 (ㄱ) 이면 ㉠ 으로 변환 절대 금지 — 원본 그대로 (ㄱ) 유지
2. 원본이 ㉠ 인데 OCR 가 (ㄱ) 박았으면 corrected 로 ㉠ 반환
3. 수학식·도형 마커 ([도형])·수식 환경 (\\begin{cases} 등) 은 OCR 결과 그대로 유지
4. 공백·줄바꿈 미세 차이는 일치로 간주 (match:true)
5. 의심스러우면 무조건 match:true — 정확도 우선

★ 자주 보이는 OCR 오인식 패턴 (참고):
- 동그라미 한글 ㉠ ㉡ ㉢ ㉣ ㉤ ㉥ ㉦ ㉧ ㉨ ㉩ ↔ OCR 의 (ㄱ) (ㄴ) ...
- 동그라미 숫자 ① ② ③ ④ ⑤ ↔ OCR 의 (1) (2) ...
- 도형 □ ○ △ ↔ OCR 의 \\square \\bigcirc \\triangle (또는 누락)`;

  const model = process.env.GEMINI_VERIFIER_MODEL || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  let parsedResult: { match?: boolean; corrected?: string; diffs?: Array<{ from: string; to: string }> } = {};
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
          maxOutputTokens: 4096,
          temperature: 0,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });
    if (!res.ok) {
      console.warn('[vision-verifier] Flash HTTP', res.status);
      return { isMatch: true, correctedText: null, diffs: [], flashCalled: true };
    }
    const data = await res.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // JSON 추출 — 코드블록 또는 raw JSON 둘 다 처리
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedResult = JSON.parse(jsonMatch[0]);
      } catch {
        // JSON 파싱 실패 — 보수적으로 match:true 처리
        return { isMatch: true, correctedText: null, diffs: [], flashCalled: true };
      }
    }
  } catch (e) {
    console.warn('[vision-verifier] Flash 호출 실패:', e instanceof Error ? e.message : e);
    return { isMatch: true, correctedText: null, diffs: [], flashCalled: true };
  }

  // 3) 결과 해석
  if (parsedResult.match === true || !parsedResult.corrected) {
    return { isMatch: true, correctedText: null, diffs: [], flashCalled: true };
  }

  // 불일치 + corrected 있음
  const correctedText = parsedResult.corrected.trim();
  const diffs = Array.isArray(parsedResult.diffs) ? parsedResult.diffs : [];

  // 안전 가드: corrected 가 OCR 보다 너무 짧으면 (50% 미만) 거부 — 비전 모델 환각 차단
  if (correctedText.length < ocrLatex.length * 0.5) {
    console.warn(
      `[vision-verifier] corrected 길이 의심 (${correctedText.length} < ${ocrLatex.length}*0.5) — 원본 유지`
    );
    return { isMatch: true, correctedText: null, diffs: [], flashCalled: true };
  }

  return { isMatch: false, correctedText, diffs, flashCalled: true };
}

/**
 * 교정 diff 를 latex_render_corrections 테이블에 자동 누적 (학습 회로 자동 닫힘).
 *
 * 누적 효과: 같은 diff (from→to) 반복 발견 시 occurrences 증가 → confidence 자동 승급
 * → 다음 자산화에서 applyLearnedRules 가 결정론적 룰로 자동 적용 (비전 호출 안 함, 비용 절감).
 *
 * Fail-safe: API 실패해도 자산화 흐름 중단 X.
 */
export async function persistVisionDiffsForLearning(
  problemId: string | null | undefined,
  diffs: Array<{ from: string; to: string }>,
  originUrl: string
): Promise<void> {
  if (!problemId || diffs.length === 0) return;

  // 짧은 diff 도 학습 누적 — 닫힌 기호는 short token. /api/latex-corrections 의 length 가드는
  // 사용자 편집 (모달) 케이스용 — 비전 자동 누적은 짧은 토큰도 허용 필요.
  // (학습 회로 분기는 future work; MVP 는 모든 diff 누적 시도, 서버 거부 시 무시)
  await Promise.all(
    diffs.map(async ({ from, to }) => {
      if (!from || !to || from === to) return;
      try {
        await fetch(`${originUrl}/api/latex-corrections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problem_id: problemId,
            source: 'content',
            original: from,
            corrected: to,
            // 비전 자동 누적임을 표시 (사용자 편집과 구분 — future analytics 용)
            source_type: 'vision_auto',
          }),
        });
      } catch (e) {
        console.warn('[vision-verifier] diff 누적 실패 (무시):', e instanceof Error ? e.message : e);
      }
    })
  );
}
