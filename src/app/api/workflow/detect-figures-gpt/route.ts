// ============================================================================
// POST /api/workflow/detect-figures-gpt
// GPT-4o Vision 으로 한 문제 안의 그래프/표 영역 좌표 검출
// (YOLO graph/table 학습 부족 보완용 — YOLO 0건 시 폴백으로 사용)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface FigureBbox {
  type?: string;  // 'graph' | 'table'
  x: number;
  y: number;
  w: number;
  h: number;
}

const SYSTEM_PROMPT = `당신은 한국 수학 문제 이미지에서 그래프/도형/표 영역의 좌표를 정확히 찾는 전문가입니다.
입력: 한 문제 영역만 잘려있는 수학 문제 이미지.
출력: 그래프, 좌표평면, 기하 도형, 표 등 시각적 도형 영역들의 bbox 좌표 (0~1 비율).

★ 중요 규칙:
- 텍스트나 수식만 있고 시각 도형이 없으면 빈 배열 [] 반환.
- 도형이 있으면 bbox 는 외곽을 타이트하게 (여백 최소화).
- 같은 도형을 중복으로 잡지 말 것.
- 선택지 ①②③④⑤ 박스는 figure 가 아님 — 무시.`;

const USER_PROMPT = `이 수학 문제 이미지에서 그래프/도형/표 영역의 좌표를 JSON 배열로 반환하세요.

형식:
[
  { "type": "graph", "x": 0.1, "y": 0.3, "w": 0.5, "h": 0.4 }
]

좌표 기준: 이미지 좌상단(0,0) ~ 우하단(1,1) 비율.
type 은 "graph" 또는 "table".
도형 없으면 빈 배열 [] 만 반환.
JSON 만 출력 — 설명·코드블록 마커 금지.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { imageBase64 } = body;

  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ figures: [], error: 'OPENAI_API_KEY not configured' });
  }

  // ★ data URL prefix 처리 (클라이언트 canvas.toDataURL 결과는 'data:image/...;base64,' 포함)
  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(`[DetectFiguresGPT] OpenAI ${resp.status}: ${errText.substring(0, 200)}`);
      return NextResponse.json({ figures: [], error: `GPT-4o ${resp.status}` });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '[]';

    // JSON 파싱 (코드블록 마커 제거)
    const jsonStr = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    let figures: FigureBbox[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        figures = parsed;
      }
    } catch (e) {
      console.warn(`[DetectFiguresGPT] JSON 파싱 실패: ${content.substring(0, 200)}`);
    }

    // 좌표 검증 — 0~1 범위 + 양수 사이즈
    const validFigures = figures.filter((f) => {
      return (
        typeof f.x === 'number' && typeof f.y === 'number' &&
        typeof f.w === 'number' && typeof f.h === 'number' &&
        f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1 &&
        f.w > 0 && f.w <= 1 && f.h > 0 && f.h <= 1 &&
        // 너무 작은 영역 제외 (오인식 가능성)
        f.w * f.h > 0.005 &&
        // 너무 큰 영역 제외 (전체를 figure 로 잡는 경우)
        f.w * f.h < 0.95
      );
    });

    console.log(`[DetectFiguresGPT] ${validFigures.length}개 figure 검출`);

    return NextResponse.json({ figures: validFigures, source: 'gpt4o-vision' });
  } catch (err) {
    console.error('[DetectFiguresGPT] error:', err);
    return NextResponse.json({
      figures: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
