// ============================================================================
// Gemini Vision — 과학 OCR (per-problem 모드)
// ============================================================================
//
// 입력: 단일 문제 crop 이미지 (작은 영역, YOLO 가 페이지에서 잘라낸 결과)
// 출력: 한 문제의 구조화 데이터 (번호/본문/선택지/배점 등)
//
// 통짜 vs per-problem 차이:
//   - 통짜: 페이지 전체 → Gemini → 좌표 환각 + 문제 누락 잦음
//   - per-problem: 문제 하나 → Gemini → 작은 영역이라 인식 정확도 ↑↑
//
// ★ 좌표·bbox 묻지 않음 — Gemini 한테 좌표 추출 책임 안 줌.
//   그림 위치는 사용자가 UI 에서 수동 드래그 (Phase 2 에서 자동화 검토).
//
// ★ 수학 영향 0 — 신규 함수, 기존 라우트 미수정.
// ============================================================================

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
// gemini-3.5-flash (2026-05-19~) — env GEMINI_SCIENCE_MODEL 오버라이드 가능.
// 롤백: GEMINI_SCIENCE_MODEL=gemini-2.5-pro
const DEFAULT_MODEL = process.env.GEMINI_SCIENCE_MODEL || 'gemini-3.5-flash';

export interface SciencePerProblemResult {
  number: number;
  content: string;
  choices: string[];
  hasFigure: boolean;
  pointsHint?: number;
  answerHint?: string;
  /** 신뢰도 (Gemini 자기 평가) — 0~1 */
  confidence?: number;
}

export interface PerProblemRaw {
  problem: SciencePerProblemResult;
  rawResponseText: string;
  finishReason: string;
  usage: {
    promptTokens?: number;
    candidatesTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
  };
  model: string;
}

/**
 * 단일 문제 crop → Gemini → 구조화 JSON
 *
 * @param cropBuffer 문제 crop 이미지 (PNG/JPEG Buffer)
 * @param mimeType 'image/png' 또는 'image/jpeg'
 * @param expectedNumber YOLO 가 추정한 문제 번호 (힌트, 없으면 0)
 */
export async function extractOneScienceProblemWithGemini(
  cropBuffer: Buffer,
  mimeType: string = 'image/png',
  expectedNumber: number = 0,
): Promise<PerProblemRaw> {
  if (!GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY (or GEMINI_API_KEY) is not configured');
  }

  const base64 = cropBuffer.toString('base64');
  const model = DEFAULT_MODEL;

  const hintLine =
    expectedNumber > 0
      ? `이 crop 은 시험지에서 잘라낸 ${expectedNumber}번 문제일 가능성이 높습니다. 표면에 표시된 실제 번호를 우선하되, 명확하지 않으면 ${expectedNumber} 로 채워주세요.`
      : `이 crop 은 시험지에서 잘라낸 단일 문제입니다.`;

  const prompt = `당신은 한국 과학 시험지(중·고등학교 통합과학·물리·화학·생명·지구과학) OCR 엔진입니다.
${hintLine}

[작업] 이 이미지에서 **문제 1개** 를 정확히 추출하여 JSON 으로 반환.

[원칙]
1. number: 시험지 표면의 실제 번호 (1~30). "01.", "1)", "[1]", "**1**" 모두 정수 1 로 정규화.
2. content: 문제의 **본문 텍스트만**. <보기> 블록도 content 안에 포함. 단 선택지(①②③④⑤)는 분리.
   ★ 중요: content **시작에 문제 번호 prefix ("1.", "01.", "1)" 등) 절대 포함 금지**.
   번호는 \`number\` 필드 전용. content 는 첫 글자부터 실제 문제 본문 시작.
3. content 안에 **그림 위치 표시**: 원본에서 그림이 있던 위치에 자리표시자 \`[그림]\` 또는 \`[그림 (가)]\`, \`[그림 (나)]\` 식으로 1줄 박음. **묘사하지 말 것** (사용자가 수동 크롭함).
4. choices: 객관식 선택지 텍스트 5개 (① 표기 제거하고 텍스트만). 서답형이면 빈 배열 [].
5. 합답형 ㄱㄴㄷ + ①②③④⑤: ㄱ/ㄴ/ㄷ 보기는 content 의 <보기> 블록에 두고, choices 는 ①~⑤ 다섯 칸으로 채움.
6. hasFigure: 그림/실험장치/그래프/도해 가 보이면 true.
7. pointsHint: 본문에 [N점] 또는 (N점) 보이면 N (숫자만, 없으면 0).
8. answerHint: 시험지에 정답이 노출돼 있으면 (예: 정답표 동봉) 답 문자, 아니면 빈 문자열.
9. confidence: 0.0~1.0. 추출에 자신 있으면 0.9+, 흐릿하거나 잘려서 애매하면 낮게.

[수식 표기]
- 인라인 수식: $...$
- 디스플레이 수식: $$...$$
- 단위: $40\\,\\mathrm{N}$ 처럼 LaTeX
- 한글은 그대로

[원형 한글 보존] ★ 중요
원본 시험지의 *원형 안에 든 한글* 은 평범한 괄호 (가)/(나) 가 아니라
유니코드 원형 문자 (㉠/㉡/㉢/㉣/㉤, ㉮/㉯/㉰/㉱/㉲) 로 정확히 출력할 것.
- 원형 ㄱ → ㉠ (U+3220)  /  원형 ㄴ → ㉡  /  원형 ㄷ → ㉢  /  원형 ㄹ → ㉣  /  원형 ㅁ → ㉤
- 원형 가 → ㉮ (U+326E)  /  원형 나 → ㉯  /  원형 다 → ㉰  /  원형 라 → ㉱  /  원형 마 → ㉲
원본이 평범한 괄호 "(가)" 면 그대로 "(가)" 로 출력 (원형 강제 X). 시각 판별 후 정확히.

[원본 박스 보존] ★ 중요
원본 시험지에 "테두리 박스 (네모 박스)" 안에 든 *증명 풀이 / 탐구 활동 본문* 이 있으면
content 안에 \`\\boxed{\\begin{aligned} ... \\end{aligned}}\` 형식으로 wrap 해서 박스 의도 보존.
- 박스 안 줄들은 \`\\\\\` 로 줄바꿈
- 한글 텍스트는 \`\\text{...}\` 안에. 수식은 \\text 밖.
- 박스 *안에 있던* 위치 라벨 (㉮, ㉯) 도 박스 안에 그대로 보존.
단, 박스가 없는 *단순 실험 절차/탐구 과정 (가) (나) (다) ...* 같은 경우는 박스 wrap 하지 말 것.

[중요]
- 좌표·bbox 묻지 마. 좌표 절대 반환하지 말 것.
- content 에 그림 묘사 금지. 자리표시자 \`[그림]\` 만.
- 1개 문제만 반환. 여러 문제가 보이면 가장 큰/중심에 있는 것 1개만.

JSON 만 응답. 설명 텍스트 추가 금지.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_KEY}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      number: { type: 'INTEGER' },
      content: { type: 'STRING' },
      choices: { type: 'ARRAY', items: { type: 'STRING' } },
      hasFigure: { type: 'BOOLEAN' },
      pointsHint: { type: 'NUMBER' },
      answerHint: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
    },
    required: ['number', 'content', 'choices', 'hasFigure'],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType } },
          ],
        },
      ],
      generationConfig: {
        // ★ 8192 → 32768 (2026-05-19): 긴 과학 문제 (지문+<보기>+합답형) 가
        //   8192 토큰 한계에 걸려 JSON 응답 중간 잘림 → content 일부 누락
        //   ("긴 문제 펼쳐보기에서 다 안나온다" 사고)
        maxOutputTokens: 32768,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Vision API failed: ${res.status} — ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason: string = data.candidates?.[0]?.finishReason || 'unknown';
  const usage = data.usageMetadata || {};

  if (!rawText) {
    throw new Error(`Gemini Vision empty response (finishReason=${finishReason})`);
  }

  let parsed: SciencePerProblemResult;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Gemini response not valid JSON: ${(e as Error).message}\nRaw: ${rawText.slice(0, 500)}`);
  }

  // 안전망 — 필수 필드 누락 시 기본값
  if (typeof parsed.number !== 'number' || isNaN(parsed.number)) parsed.number = expectedNumber || 0;
  if (typeof parsed.content !== 'string') parsed.content = '';
  if (!Array.isArray(parsed.choices)) parsed.choices = [];
  if (typeof parsed.hasFigure !== 'boolean') parsed.hasFigure = false;

  return {
    problem: parsed,
    rawResponseText: rawText,
    finishReason,
    usage: {
      promptTokens: usage.promptTokenCount,
      candidatesTokens: usage.candidatesTokenCount,
      thoughtsTokens: usage.thoughtsTokenCount,
      totalTokens: usage.totalTokenCount,
    },
    model,
  };
}
