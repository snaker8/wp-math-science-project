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

const DETECT_PROMPT = `당신은 한국 수학 시험지 분석 전문가입니다.

이 이미지는 수학 시험지의 한 페이지입니다. 각 문제의 위치를 정확히 찾아 바운딩 박스를 반환하세요.

규칙:
1. 각 문제는 문제 번호(1, 2, 3... 또는 01, 02, 03...)로 시작합니다
2. 문제 영역에는 문제 텍스트, 수식, 그래프, 그림, 보기, 선택지가 모두 포함되어야 합니다
3. 시험지 헤더(학교명, 과목명, 이름란, 날짜, 시험 제목)는 절대 포함하지 마세요
4. 시험지 하단의 빈 여백, 로고, 페이지 번호도 제외하세요
5. 문제가 없는 빈 영역은 감지하지 마세요
6. 좌표는 이미지 전체 크기 대비 비율(0~1)로 반환하세요:
   - x: 왼쪽 모서리 위치 (0=이미지 왼쪽 끝, 1=오른쪽 끝)
   - y: 위쪽 모서리 위치 (0=이미지 위쪽 끝, 1=아래쪽 끝)
   - w: 너비 비율
   - h: 높이 비율
7. 2단 레이아웃이면 왼쪽 열 위→아래, 오른쪽 열 위→아래 순서로 반환하세요
8. 바운딩 박스는 해당 문제의 모든 내용(문제 번호, 본문, 수식, 그래프, 보기, 선택지)을 빠짐없이 포함해야 합니다
9. 문제 번호부터 마지막 선택지/그림까지 포함하고, 상하좌우에 약간의 여유(2~3%)를 두세요. 내용이 잘리는 것보다 약간 넓은 것이 낫습니다
10. 특히 선택지(①②③④⑤)가 문제 아래에 있으면 반드시 bbox에 포함하세요. 선택지가 2열로 배치된 경우 좌우 모두 포함하세요

반드시 아래 JSON 형식으로만 응답하세요:
{
  "problems": [
    { "number": 1, "x": 0.03, "y": 0.15, "w": 0.45, "h": 0.20 },
    { "number": 2, "x": 0.03, "y": 0.36, "w": 0.45, "h": 0.25 }
  ]
}`;

/**
 * POST /api/workflow/detect-problems
 *
 * Body:
 *   imageBase64: string — 페이지 전체 이미지 (data:image/png;base64,...)
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
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    // GPT-4o Vision API 호출
    console.log('[DetectProblems] GPT-4o Vision 호출 시작...');
    const startTime = Date.now();

    const result = await callVisionAPI(imageBase64);

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
  backoff = 3000
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
                { type: 'text', text: DETECT_PROMPT },
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
