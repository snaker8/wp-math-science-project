// ============================================================================
// POST /api/workflow/detect-problems-yolo
// YOLO 기반 문제 영역 감지 + GPT-4o Vision 폴백
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

// ★ Vercel 서버리스 타임아웃: YOLO(10초) + GPT-4o 폴백(20~30초) 가능
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const YOLO_SERVER_URL = process.env.YOLO_SERVER_URL || 'http://localhost:8100';
const YOLO_CONFIDENCE = parseFloat(process.env.YOLO_CONFIDENCE_THRESHOLD || '0.25');
const YOLO_TIMEOUT = parseInt(process.env.YOLO_TIMEOUT_MS || '10000');

interface DetectedBbox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
  class?: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { imageBase64, pageNumber, expectedStartNumber, forceGpt, figureOnly } = body;

  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
  }

  // YOLO 서버 시도 (forceGpt가 아닌 경우)
  if (!forceGpt) {
    try {
      const yoloResult = await callYoloServer(imageBase64, pageNumber || 1);
      // ★ figureOnly 모드 — problem 0건이어도 GPT-4o 폴백 X.
      //   분석 후 problem 크롭에서 graph/table 만 찾는 흐름. 폴백은 problem detection 용이라
      //   figure 검출엔 무용. 14회 헛 호출 막아 응답 시간 단축.
      if (figureOnly && yoloResult) {
        return NextResponse.json({
          problems: yoloResult.problems,
          others: yoloResult.others,
          count: yoloResult.problems.length,
          source: 'yolo',
          inference_ms: yoloResult.inference_ms,
        });
      }
      if (yoloResult && yoloResult.problems.length > 0) {
        console.log(`[DetectYOLO] ${yoloResult.problems.length}개 문제 감지 (YOLO, page ${pageNumber})`);
        return NextResponse.json({
          problems: yoloResult.problems,
          others: yoloResult.others,
          count: yoloResult.problems.length,
          source: 'yolo',
          inference_ms: yoloResult.inference_ms,
        });
      }
      console.log(`[DetectYOLO] YOLO 0건 → GPT-4o Vision 폴백`);
    } catch (err) {
      console.warn(`[DetectYOLO] YOLO 서버 오류 → GPT-4o Vision 폴백:`, err instanceof Error ? err.message : err);
      // figureOnly 모드에선 YOLO 실패 시 빈 결과 반환 (GPT-4o 폴백 X)
      if (figureOnly) {
        return NextResponse.json({
          problems: [],
          others: [],
          count: 0,
          source: 'yolo-error',
          inference_ms: 0,
        });
      }
    }
  }

  // 폴백: 기존 GPT-4o Vision 엔드포인트 호출
  try {
    const gptRes = await fetch(`${request.nextUrl.origin}/api/workflow/detect-problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, pageNumber, expectedStartNumber }),
    });

    if (gptRes.ok) {
      const data = await gptRes.json();
      return NextResponse.json({ ...data, source: 'gpt4o' });
    }

    const errData = await gptRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: 'Both YOLO and GPT-4o failed', detail: errData },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Detection failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function callYoloServer(
  imageBase64: string,
  pageNumber: number
): Promise<{ problems: DetectedBbox[]; others: DetectedBbox[]; inference_ms: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOLO_TIMEOUT);

  try {
    // 헬스체크
    const healthRes = await fetch(`${YOLO_SERVER_URL}/health`, {
      signal: controller.signal,
    });
    if (!healthRes.ok) throw new Error('YOLO server unhealthy');

    const health = await healthRes.json();
    if (!health.model_loaded) throw new Error('YOLO model not loaded');

    // FormData로 전송
    const formData = new FormData();
    formData.append('image_base64', imageBase64);
    formData.append('confidence', String(YOLO_CONFIDENCE));
    formData.append('page_number', String(pageNumber));

    const detectRes = await fetch(`${YOLO_SERVER_URL}/detect`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!detectRes.ok) throw new Error(`YOLO detect error: ${detectRes.status}`);

    const data = await detectRes.json();

    const problems: DetectedBbox[] = (data.problems || []).map((p: any) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      confidence: p.confidence,
      class: p.class || 'problem',
    }));

    const others: DetectedBbox[] = (data.others || []).map((p: any) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      confidence: p.confidence,
      class: p.class,
    }));

    return {
      problems,
      others,
      inference_ms: data.inference_ms || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
