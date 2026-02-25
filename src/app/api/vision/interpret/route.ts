// ============================================================================
// Vision Interpret API — 이미지를 GPT-4o Vision으로 해석하여 구조화된 데이터 반환
// POST /api/vision/interpret
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { interpretImage, interpretImages } from '@/lib/vision/image-interpreter';

// ============================================================================
// POST: 이미지 해석
// ============================================================================

/**
 * Request body:
 * - imageUrl: string — 단일 이미지 URL 또는 base64 data URL
 * - imageUrls: string[] — 여러 이미지 URL (imageUrl과 imageUrls 중 하나 필수)
 * - context?: string — 문제 텍스트 (맥락 제공, 선택)
 *
 * Response:
 * - { success: true, figures: InterpretedFigure[] }
 * - { success: false, error: string, code: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. API 키 확인
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI API key not configured', code: 'API_KEY_MISSING' },
        { status: 500 }
      );
    }

    // 2. 요청 파싱
    const body = await request.json();
    const { imageUrl, imageUrls, context } = body as {
      imageUrl?: string;
      imageUrls?: string[];
      context?: string;
    };

    // 3. 입력 검증
    const urls: string[] = [];
    if (imageUrl && typeof imageUrl === 'string') {
      urls.push(imageUrl);
    }
    if (Array.isArray(imageUrls)) {
      for (const u of imageUrls) {
        if (typeof u === 'string' && u.length > 0) {
          urls.push(u);
        }
      }
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'imageUrl or imageUrls is required', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // 최대 10개 이미지 제한 (비용 + 시간 제약)
    if (urls.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Maximum 10 images allowed per request', code: 'TOO_MANY_IMAGES' },
        { status: 400 }
      );
    }

    // 4. Vision 해석 실행
    console.log(`[Vision API] Processing ${urls.length} image(s)`);
    const startTime = Date.now();

    let figures;
    if (urls.length === 1) {
      const result = await interpretImage(urls[0], context);
      figures = [result];
    } else {
      figures = await interpretImages(urls, context);
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[Vision API] Completed in ${processingTimeMs}ms — ${figures.length} figure(s) interpreted`);

    // 5. 통계 요약
    const stats = {
      total: figures.length,
      interpreted: figures.filter(f => f.figureType !== 'photo' && f.rendering !== null).length,
      fallback: figures.filter(f => f.figureType === 'photo' || f.rendering === null).length,
      byType: figures.reduce((acc, f) => {
        acc[f.figureType] = (acc[f.figureType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      success: true,
      figures,
      stats,
      processingTimeMs,
    });
  } catch (error) {
    console.error('[Vision API] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
