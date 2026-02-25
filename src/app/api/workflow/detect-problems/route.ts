// ============================================================================
// GPT-4o Vision 기반 시험지 문제 영역 감지 API
// 페이지 이미지를 보내면 각 문제의 바운딩 박스(0~1 비율)를 반환
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface DetectedProblem {
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 페이지 컨텍스트를 포함하여 프롬프트 생성
function buildDetectPrompt(pageNumber?: number, expectedStartNumber?: number): string {
  const pageContext = pageNumber
    ? `\n이 이미지는 시험지의 ${pageNumber}번째 페이지입니다.${pageNumber === 1 ? ' 첫 페이지이므로 시험 안내문/주의사항/문항수 안내 등이 있을 수 있습니다. 이런 안내 텍스트는 문제가 아니므로 절대 포함하지 마세요.' : ''}${expectedStartNumber ? ` 이 페이지의 첫 문제는 ${expectedStartNumber}번부터 시작할 것으로 예상됩니다.` : ''}`
    : '';

  return `당신은 한국 수학 시험지 분석 전문가입니다.

이 이미지는 수학 시험지의 한 페이지입니다.${pageContext}
각 문제의 위치를 정확히 찾아 바운딩 박스를 반환하세요.

규칙:`;
}

const DETECT_RULES = `
1. **문제의 시작점 판별이 가장 중요합니다.** 문제는 반드시 "숫자." 또는 "숫자)" 형식의 문제 번호로 시작합니다 (예: "1.", "2.", "01.", "<서답형 1번>"). 문제 번호가 없는 텍스트(시험 안내문, 문항수 안내, 주의사항, ★표시 안내 등)는 절대로 문제가 아닙니다
2. **bbox의 상단(y좌표)은 정확히 문제 번호 텍스트가 시작하는 행**이어야 합니다. 문제 번호 위의 안내문, 설명, 빈 공간은 포함하지 마세요
3. bbox의 하단은 해당 문제의 마지막 선택지/그림/수식까지입니다. 다음 문제 번호가 나오기 직전까지만 포함하세요
4. 문제 영역에는 문제 텍스트, 수식, 그래프, 그림, 보기, 선택지, [배점] 표시가 모두 포함되어야 합니다
5. 다음은 문제가 아닌 것들입니다 — 절대 bbox에 포함하지 마세요:
   - 시험지 헤더 (학교명, 과목명, 교육과정, 이름란, 날짜 등의 표 형태 영역)
   - 시험 안내문 (■ 문항수, ■ OMR 카드 안내, ■ 서답형 안내, 주의사항 등)
   - 페이지 번호, 하단 로고, "★뒷면에 서술형 문제 있습니다" 같은 안내 문구
6. 좌표는 이미지 전체 크기 대비 비율(0~1)로 반환하세요:
   - x: 왼쪽 모서리 위치 (0=이미지 왼쪽 끝, 1=오른쪽 끝)
   - y: 위쪽 모서리 위치 (0=이미지 위쪽 끝, 1=아래쪽 끝)
   - w: 너비 비율
   - h: 높이 비율
7. 2단 레이아웃이면 왼쪽 열 위→아래, 오른쪽 열 위→아래 순서로 반환하세요. 왼쪽 열의 x는 0~0.5, 오른쪽 열의 x는 0.5~1 범위입니다
8. **바운딩 박스를 최대한 타이트하게 잡으세요.** 여유 마진은 넣지 마세요 — 후처리에서 자동으로 패딩을 추가합니다
9. 특히 선택지(①②③④⑤)가 문제 아래에 있으면 반드시 bbox에 포함하세요. 선택지가 2열로 배치된 경우 좌우 모두 포함하세요
10. 각 문제는 정확히 하나의 bbox를 가져야 합니다. 하나의 bbox에 여러 문제를 합치지 마세요
11. 빈 영역이나 문제가 없는 공간에는 bbox를 만들지 마세요

반드시 아래 JSON 형식으로만 응답하세요:
{
  "problems": [
    { "number": 1, "x": 0.03, "y": 0.25, "w": 0.45, "h": 0.18 },
    { "number": 2, "x": 0.03, "y": 0.44, "w": 0.45, "h": 0.22 }
  ]
}`;

/**
 * POST /api/workflow/detect-problems
 *
 * Body:
 *   imageBase64: string — 페이지 전체 이미지 (data:image/png;base64,...)
 *   pageNumber?: number — 페이지 번호 (1-based, 선택)
 *   expectedStartNumber?: number — 이 페이지 시작 문제번호 (선택)
 *
 * Response:
 *   problems: { x, y, w, h }[] — 문제별 바운딩 박스 (0~1 비율)
 *   count: number
 */
export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { imageBase64, pageNumber, expectedStartNumber } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    // GPT-4o Vision API 호출
    console.log(`[DetectProblems] GPT-4o Vision 호출 시작... (page=${pageNumber || '?'}, startNum=${expectedStartNumber || '?'})`);
    const startTime = Date.now();

    const result = await callVisionAPI(imageBase64, 3, 3000, pageNumber, expectedStartNumber);

    const elapsed = Date.now() - startTime;
    console.log(`[DetectProblems] ${result.length}개 문제 감지 (${elapsed}ms)`);

    return NextResponse.json({
      problems: result,
      count: result.length,
    });
  } catch (error) {
    console.error('[DetectProblems] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * GPT-4o Vision API 호출 (retry 포함)
 */
async function callVisionAPI(
  imageBase64: string,
  retries = 3,
  backoff = 3000,
  pageNumber?: number,
  expectedStartNumber?: number
): Promise<{ x: number; y: number; w: number; h: number }[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: buildDetectPrompt(pageNumber, expectedStartNumber) + DETECT_RULES },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageBase64,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.status === 429) {
        // Rate limit — retry with backoff
        const waitTime = backoff * (attempt + 1);
        console.warn(`[DetectProblems] Rate limited, ${waitTime}ms 후 재시도 (${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from GPT-4o');
      }

      // JSON 파싱
      const parsed = JSON.parse(content);
      const problems: DetectedProblem[] = parsed.problems || [];

      // 좌표 검증 + 정렬
      return validateAndSortBboxes(problems);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[DetectProblems] Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, backoff * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * 좌표 검증 + 읽기 순서 정렬
 */
function validateAndSortBboxes(
  raw: DetectedProblem[]
): { x: number; y: number; w: number; h: number }[] {
  return raw
    .filter(p =>
      typeof p.x === 'number' && typeof p.y === 'number' &&
      typeof p.w === 'number' && typeof p.h === 'number' &&
      p.x >= 0 && p.y >= 0 && p.w > 0.01 && p.h > 0.01 &&
      p.x + p.w <= 1.05 && p.y + p.h <= 1.05 // 약간의 여유
    )
    .map(p => ({
      x: Math.max(0, p.x),
      y: Math.max(0, p.y),
      w: Math.min(1 - Math.max(0, p.x), p.w),
      h: Math.min(1 - Math.max(0, p.y), p.h),
    }))
    // 읽기 순서 정렬: 좌측열(x<0.5) 위→아래, 우측열 위→아래
    .sort((a, b) => {
      const aCol = a.x + a.w / 2 < 0.5 ? 0 : 1;
      const bCol = b.x + b.w / 2 < 0.5 ? 0 : 1;
      if (aCol !== bCol) return aCol - bCol;
      return a.y - b.y;
    });
}
