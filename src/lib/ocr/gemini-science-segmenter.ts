// ============================================================================
// Gemini Vision — 과학 페이지 → 문제 bbox 분할 (segmentation 전용)
// ============================================================================
//
// 수학 YOLO 가 과학 시험지 인식 못 하는 경우의 폴백.
// 페이지 PNG 하나를 받아 페이지 안 모든 문제의 정규화 bbox 만 반환.
// 본문 OCR 은 안 함 — 좌표만. 작아도 정확도 충분.
// ============================================================================

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_SCIENCE_SEGMENT_MODEL || 'gemini-2.5-pro';

export interface SegmentBBox {
  /** 시험지 번호 (없으면 0) */
  number: number;
  /** 페이지 정규화 좌표 (0~1) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SegmentResult {
  bboxes: SegmentBBox[];
  rawText: string;
  finishReason: string;
  usage: {
    promptTokens?: number;
    candidatesTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
  };
}

export async function segmentSciencePageWithGemini(
  pageBuffer: Buffer,
): Promise<SegmentResult> {
  if (!GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY is not configured');
  }

  const base64 = pageBuffer.toString('base64');
  const model = DEFAULT_MODEL;

  const prompt = `당신은 한국 과학 시험지(중·고등학교) 분석 엔진입니다.
이 이미지는 시험지의 한 페이지 전체입니다. 페이지 안에 있는 **모든 문제 각각의 영역 bbox** 만 반환하세요.

[규칙]
1. 한 페이지에 보통 1~20개 문제. 각 문제 = 한 덩어리.
2. 문제 영역에 포함시킬 것:
   - 문제 번호 ("1.", "01.", "[1]" 등)
   - 본문 텍스트
   - <보기> 박스 (있으면)
   - 그림/실험장치/그래프 (해당 문제에 속하면)
   - 선택지 ①②③④⑤
3. 좌표는 **페이지 정규화 (0.0~1.0)**. 좌상단 (0,0), 우하단 (1,1).
4. x, y, w, h: 좌상단 + 너비/높이.
5. number: 시험지 표면 번호 (1~30). 안 보이면 0.
6. 박스를 살짝 여유 있게 — 라벨·끝 글자 잘리지 않도록.
7. 페이지 헤더/푸터(제목·날짜·이름칸·페이지번호) 는 제외.
8. 시험지 안내 문구·해설 페이지는 제외 — 실제 문제 영역만.

JSON 으로만 반환:
{
  "bboxes": [
    { "number": 1, "x": 0.05, "y": 0.04, "w": 0.45, "h": 0.30 },
    { "number": 2, "x": 0.05, "y": 0.36, "w": 0.45, "h": 0.28 }
  ]
}

JSON 만 응답. 설명 텍스트 추가 금지.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_KEY}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      bboxes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            number: { type: 'INTEGER' },
            x: { type: 'NUMBER' },
            y: { type: 'NUMBER' },
            w: { type: 'NUMBER' },
            h: { type: 'NUMBER' },
          },
          required: ['x', 'y', 'w', 'h'],
        },
      },
    },
    required: ['bboxes'],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType: 'image/png' } },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini segment failed: ${res.status} — ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason: string = data.candidates?.[0]?.finishReason || 'unknown';
  const usage = data.usageMetadata || {};

  if (!rawText) {
    throw new Error(`Gemini segment empty (finishReason=${finishReason})`);
  }

  let parsed: { bboxes: SegmentBBox[] };
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Gemini segment not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed.bboxes)) {
    throw new Error('Gemini segment missing bboxes array');
  }

  // 좌표 clamp (0~1 보정)
  const cleaned = parsed.bboxes.map((b) => ({
    number: typeof b.number === 'number' ? b.number : 0,
    x: Math.max(0, Math.min(1, b.x)),
    y: Math.max(0, Math.min(1, b.y)),
    w: Math.max(0, Math.min(1, b.w)),
    h: Math.max(0, Math.min(1, b.h)),
  }));

  return {
    bboxes: cleaned,
    rawText,
    finishReason,
    usage: {
      promptTokens: usage.promptTokenCount,
      candidatesTokens: usage.candidatesTokenCount,
      thoughtsTokens: usage.thoughtsTokenCount,
      totalTokens: usage.totalTokenCount,
    },
  };
}
