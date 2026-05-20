// ============================================================================
// Gemini Vision — 과학 OCR 클라이언트 (POC)
// ============================================================================
//
// 입력: PDF 또는 이미지 (Buffer)
// 출력: 구조화 JSON (문제 배열)
// 모델: gemini-3.5-flash (기본, 2026-05-19~) — env GEMINI_SCIENCE_MODEL 로 오버라이드.
//   이전 gemini-2.5-pro 대비 output 가격 $10→$9 + 속도 개선 기대.
//   롤백 필요 시 env GEMINI_SCIENCE_MODEL=gemini-2.5-pro 로 즉시 복귀.
//
// ★ 수학 영향 0 — 과학 전용. `src/lib/ocr/mathpix.ts` 와 분리.
// ★ 패턴 출처: `src/app/api/exams/[examId]/match-answers/route.ts`
//   의 extractAnswersWithGemini / extractSolutionsWithGemini.
//   직접 fetch + responseSchema 로 JSON 강제.
// ============================================================================

import type { ScienceGeminiProblem } from '@/types/science-ocr';

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_SCIENCE_MODEL || 'gemini-3.5-flash';

/**
 * Gemini Vision 호출 결과 (raw)
 */
export interface GeminiScienceOCRRaw {
  problems: ScienceGeminiProblem[];
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
 * 과학 시험지 PDF/이미지 → 구조화된 문제 배열
 *
 * @param fileBuffer 원본 파일 Buffer
 * @param mimeType MIME 타입 ('application/pdf', 'image/jpeg' 등)
 */
export async function extractScienceProblemsWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<GeminiScienceOCRRaw> {
  if (!GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY (or GEMINI_API_KEY) is not configured');
  }

  const base64 = fileBuffer.toString('base64');
  const model = DEFAULT_MODEL;

  const prompt = `You are a science exam OCR engine. The input is a Korean science exam (중·고등학교 통합과학·물리·화학·생명·지구과학). Extract every problem on the page(s) into a structured JSON array.

[원칙]
1. 문제 번호는 시험지 표면에 적힌 그대로 (1~30). "01.", "1)", "[1]", "**1**" 모두 같은 번호 1로 정규화.
2. 본문(content)에는 문제의 모든 텍스트·수식·"<보기>" 블록을 포함. 단, 선택지(①②③④⑤ 또는 1)2)3)4)5))는 분리해서 choices 배열에 넣어라.
3. 수식 표기: 인라인은 $...$, 디스플레이는 $$...$$. 한글 폰트 그대로 유지 (KaTeX 호환).
4. 그림·실험장치·그래프·표가 있으면 hasFigure=true 이고, **반드시** figures 배열에 좌표를 채워라 (아래 [삽화 좌표 규칙]). 삽화를 텍스트로 묘사하지 말 것 — 본문엔 자리표시자 \`[그림]\` 또는 \`(그림 참고)\` 정도만 두고, 실제 그림은 서버가 bbox 로 크롭해 카드에 박음.
5. 배점이 본문에 [N점] 또는 (N점) 형태로 보이면 pointsHint 에 N (숫자만).
6. 정답이 시험지에 노출돼있으면 answerHint 에 채움. 아니면 빈 문자열.
7. 페이지 번호는 추정 가능하면 pageHint (1-based).
8. 문제가 아닌 페이지(표지/해답지/광고)는 결과에서 제외.
9. 본문에 시험지 헤더/푸터(제목/날짜/이름 칸 등)는 포함하지 말 것.

[원형 한글 보존] ★ 중요
원본 시험지에 *원형 안에 든 한글* 은 평범한 괄호 "(가)" 가 아니라 유니코드 원형 문자로 정확히 출력할 것.
- 원형 ㄱ → ㉠ (U+3220)  /  원형 ㄴ → ㉡  /  원형 ㄷ → ㉢  /  원형 ㄹ → ㉣  /  원형 ㅁ → ㉤
- 원형 가 → ㉮ (U+326E)  /  원형 나 → ㉯  /  원형 다 → ㉰  /  원형 라 → ㉱  /  원형 마 → ㉲
원본이 평범한 괄호 "(가)" 면 그대로 "(가)" 로 출력 (원형 강제 X). 시각 판별 후 정확히.

[원본 박스 보존] ★ 중요
원본 시험지에 "테두리 박스 (네모 박스)" 안에 든 *증명 풀이 / 탐구 활동 본문* 이 있으면
content 안에 \`\\boxed{\\begin{aligned} ... \\end{aligned}}\` 형식으로 wrap 해서 박스 의도 보존.
- 박스 안 줄들은 \`\\\\\` 로 줄바꿈
- 한글 텍스트는 \`\\text{...}\` 안에. 수식은 \\text 밖.
단, 박스가 없는 *단순 실험 절차/탐구 과정 (가) (나) (다) ...* 같은 경우는 박스 wrap 하지 말 것.

[선택지 규칙]
- 객관식: choices 에 ①②③④⑤ 순서대로 텍스트만 (번호·기호 제외).
- 합답형 ㄱㄴㄷ + ①②③④⑤: ㄱ/ㄴ/ㄷ 보기는 content 의 <보기> 블록에 두고, choices 는 ①~⑤ 다섯 칸으로 채움.
- 서답형/논술형 (선택지 없음): choices 는 빈 배열 [].
- 표 객관식 (열 헤더 a/b/c, 각 ①②③④⑤ 행에 컬럼 값): 각 row 를 "값1 | 값2 | 값3" 형태로 join 해 choices 에 넣어라.

[삽화 좌표 규칙 — ★★★ 매우 중요 ★★★]
- 좌표는 **페이지 정규화 (0.0~1.0)**. 좌상단 (0,0), 우하단 (1,1).
- pageIdx: PDF 페이지 인덱스, 0-based (첫 페이지=0).
- x, y, w, h: 삽화의 좌상단 좌표와 너비·높이 (모두 0.0~1.0).
- 한 문제에 그림이 여러 개면 figures 에 여러 항목 (예: 실험장치 + 결과그래프 = 2개. (가)·(나) 두 그림이면 figures 2개).
- placement: 본문 content 의 몇 번째 마침표 뒤에 그림을 넣을지 hint (0=맨 앞, 1=첫 문장 끝, ...). 모르면 0.
- descriptionHint: 한국어 짧은 라벨 (예: '용수철저울 (가)', '회로도', '세포 분열 모식도', '지층 단면도').
- 표(table) 가 인라인 데이터표가 아니라 **실험 결과표/자료표/그림 같은 표** 면 figures 에 포함. 단순 수치 데이터표는 content 안에 LaTeX 표로 처리.

[JSON 스키마 예시]
{
  "problems": [
    {
      "number": 5,
      "content": "그림 (가)는 물체 A 가 용수철저울에 매달려 정지해 있는 모습을, (나)는 (가)의 A 를 물에 넣었을 때 A 가 물속에서 정지해 있는 모습을 나타낸 것이다. (가)와 (나)에서 용수철저울로 측정한 힘의 크기는 각각 $40\\,\\mathrm{N}$, $30\\,\\mathrm{N}$ 이다.\\n\\n(나)에서 A 에 작용하는 부력의 크기는? [3점]",
      "choices": ["10 N", "30 N", "40 N", "50 N", "70 N"],
      "hasFigure": true,
      "figures": [
        { "pageIdx": 0, "x": 0.18, "y": 0.32, "w": 0.30, "h": 0.22, "placement": 1, "descriptionHint": "용수철저울 (가)·(나)" }
      ],
      "pageHint": 1,
      "pointsHint": 3,
      "answerHint": ""
    }
  ]
}

JSON 만 응답하세요. 설명 텍스트 절대 추가 금지.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_KEY}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      problems: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            number: { type: 'INTEGER' },
            content: { type: 'STRING' },
            choices: { type: 'ARRAY', items: { type: 'STRING' } },
            hasFigure: { type: 'BOOLEAN' },
            figures: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  pageIdx: { type: 'INTEGER' },
                  x: { type: 'NUMBER' },
                  y: { type: 'NUMBER' },
                  w: { type: 'NUMBER' },
                  h: { type: 'NUMBER' },
                  placement: { type: 'INTEGER' },
                  descriptionHint: { type: 'STRING' },
                },
                required: ['pageIdx', 'x', 'y', 'w', 'h'],
              },
            },
            pageHint: { type: 'INTEGER' },
            pointsHint: { type: 'NUMBER' },
            answerHint: { type: 'STRING' },
          },
          required: ['number', 'content', 'choices', 'hasFigure'],
        },
      },
    },
    required: ['problems'],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      generationConfig: {
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
    throw new Error(`Gemini Vision returned empty response (finishReason=${finishReason})`);
  }

  let parsed: { problems: ScienceGeminiProblem[] };
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Gemini response is not valid JSON: ${(e as Error).message}\nRaw: ${rawText.slice(0, 500)}`);
  }

  if (!parsed.problems || !Array.isArray(parsed.problems)) {
    throw new Error('Gemini response missing "problems" array');
  }

  return {
    problems: parsed.problems,
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
