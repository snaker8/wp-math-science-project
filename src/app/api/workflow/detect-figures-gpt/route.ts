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

const SYSTEM_PROMPT = `당신은 한국 수학 문제 이미지에서 그래프·좌표평면·기하 도형·표 영역의 좌표를 정확히 찾는 전문가입니다.
입력: 한 문제 영역만 잘려있는 수학 문제 이미지.
출력: 시각 도형 영역들의 bbox 좌표 (0~1 비율).

★ bbox 잡는 규칙 — 매우 중요:
1. 그래프 영역은 다음을 모두 포함해야 함:
   - x축, y축 (화살표 끝까지)
   - 모든 곡선·실선·점선
   - 축 위 숫자 라벨 (예: -2, -1, 0, 1, 2)
   - 함수명 라벨 (예: y=f(x), y=g(x))
2. bbox 는 약간의 여유를 둘 것 — 그래프 끝이 잘리는 게 가장 큰 사고.
   타이트하게 잡지 말고 외곽 5~10% 여유 포함.
3. ★ 시험지 원본의 시각적 묶음 그대로 잡기:
   - 한 영역(같은 줄·같은 박스)에 모여있는 그래프들 → 모두 포함하는 한 bbox
     예: y=f(x) 와 y=g(x) 가 좌우로 나란히 한 줄 → 둘 모두 포함하는 큰 bbox 1개
   - 명확히 분리된 영역 (다른 단락, 멀리 떨어짐, 그래프 + 별도 표) → 각각 별도 bbox
   - 판단 기준: "사용자가 가위로 오린다면 한 번에 자를 수 있는 영역인가"
4. 한 묶음 안에서 영역을 쪼개지 말 것 (분할 금지).
5. 그래프와 표가 명확히 분리된 영역에 있으면 별도 bbox (다른 type).

★ 무시할 것 (figure 아님):
- 텍스트, 수식 ($...$, $$...$$)
- 선택지 ①②③④⑤ 또는 (1)(2)(3)(4)(5) 박스
- ㄱ, ㄴ, ㄷ 박스 (보기 항목)
- 점수 표기 [N점], [총 N점]

★ 빈 배열 반환:
- 시각 도형이 전혀 없을 때만 [] 반환.
- 텍스트만 있는 문제는 빈 배열.`;

const USER_PROMPT = `이 수학 문제 이미지에서 그래프/도형/표 영역의 좌표를 JSON 배열로 반환하세요.

형식:
[
  { "type": "graph", "x": 0.1, "y": 0.3, "w": 0.5, "h": 0.4 }
]

좌표:
- 이미지 좌상단(0,0) ~ 우하단(1,1) 비율
- bbox 는 외곽을 약간 여유있게 (그래프 끝이 잘리지 않도록)
- 축 라벨, 함수명까지 모두 포함

type 은 "graph" 또는 "table".
도형 없으면 빈 배열 [] 만 반환.
JSON 만 출력 — 설명·코드블록 마커 금지.`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { imageBase64 } = body;

  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
  }

  // ★ 안전 토글 — env DETECT_FIGURES_GPT_ENABLED='true' 일 때만 GPT 호출.
  //   기본값 OFF → 정확도 검증 전엔 비용·오삽입 위험 없음.
  //   Vercel Dashboard 에서 env 변수 설정만으로 활성화 가능 (재배포 불필요).
  if (process.env.DETECT_FIGURES_GPT_ENABLED !== 'true') {
    return NextResponse.json({ figures: [], source: 'disabled' });
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
        temperature: 0,  // ★ 일관성 우선 — 같은 이미지에 같은 결과
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
