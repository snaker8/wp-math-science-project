// ============================================================================
// POST /api/workflow/crop-figure
// ============================================================================
//
// 과학 자산화 Gemini POC 용 — figures bbox 좌표로 PDF/이미지 크롭.
//
// 흐름:
//   1) Body 에서 file_base64 + bbox 받기
//   2) image-pipeline 서버(/crop-figure) 호출 — PyMuPDF 가 페이지 렌더 후 크롭
//   3) 결과 PNG 에 tryUpscaleCrop (Sharp Lanczos3) 적용
//   4) assessCropQuality 로 품질 평가
//   5) base64 + 메타데이터 응답
//
// ★ 수학 영향 0 — 새 endpoint, 기존 라우트 미수정.
// ★ Phase 1: Sharp 업스케일까지만. Nanobanana/GPT Image 폴백은 Phase 2.
//   품질 불량 시 nanobananaFallbackNeeded=true 플래그만 반환.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { assessCropQuality, tryUpscaleCrop } from '@/lib/vision/image-upscaler';

const IMAGE_PIPELINE_URL = process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';
const PIPELINE_TIMEOUT_MS = 30_000;

export const maxDuration = 60;

interface CropFigureRequest {
  /** PDF 또는 이미지 base64 (data: prefix 허용) */
  file_base64: string;
  /** 'application/pdf' / 'image/jpeg' / 'image/png' 등 */
  mime_type: string;
  /** PDF 페이지 인덱스 (0-based). 이미지는 무시. */
  pageIdx?: number;
  /** 정규화 bbox 좌상단 X (0~1) */
  x: number;
  /** 정규화 bbox 좌상단 Y */
  y: number;
  /** 정규화 bbox 너비 */
  w: number;
  /** 정규화 bbox 높이 */
  h: number;
  /** PDF 렌더 DPI (기본 400) */
  dpi?: number;
  /** bbox 주변 여유 padding (정규화, 기본 0.01) */
  padding?: number;
}

interface CropFigureResponse {
  success: boolean;
  /** 업스케일 후 PNG base64 (raw, no prefix) */
  imageBase64?: string;
  /** 원본 크롭 픽셀 크기 */
  originalSize?: { width: number; height: number };
  /** 업스케일 후 픽셀 크기 */
  upscaledSize?: { width: number; height: number; scale: number };
  /** assessCropQuality 결과 */
  quality?: {
    score: number;
    isUsable: boolean;
    reason: string;
  };
  /**
   * 품질 불량 → Phase 2 (Nanobanana / GPT Image) 폴백 권장 플래그.
   * Phase 1 에선 실제 호출 X, 호출이 필요한지만 알림.
   */
  nanobananaFallbackNeeded?: boolean;
  pageCount?: number;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<CropFigureResponse>> {
  try {
    const body = (await req.json()) as CropFigureRequest;
    const { file_base64, mime_type, x, y, w, h } = body;
    const pageIdx = body.pageIdx ?? 0;
    const dpi = body.dpi ?? 400;
    const padding = body.padding ?? 0.01;

    if (!file_base64 || typeof mime_type !== 'string') {
      return NextResponse.json(
        { success: false, error: 'file_base64 와 mime_type 이 필요합니다.' },
        { status: 400 },
      );
    }
    if ([x, y, w, h].some((v) => typeof v !== 'number' || v < 0 || v > 1)) {
      return NextResponse.json(
        { success: false, error: 'bbox(x,y,w,h) 는 0~1 범위 숫자여야 합니다.' },
        { status: 400 },
      );
    }

    // 1) image-pipeline 호출 — 페이지 렌더 + 크롭
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);

    const pipelineRes = await fetch(`${IMAGE_PIPELINE_URL}/crop-figure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64,
        mime_type,
        page_idx: pageIdx,
        x,
        y,
        w,
        h,
        dpi,
        padding,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!pipelineRes.ok) {
      const errText = await pipelineRes.text();
      return NextResponse.json(
        {
          success: false,
          error: `image-pipeline 크롭 실패 (HTTP ${pipelineRes.status}): ${errText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const pipelineData = (await pipelineRes.json()) as {
      image_base64: string;
      width: number;
      height: number;
      page_count: number;
    };

    const cropBuffer = Buffer.from(pipelineData.image_base64, 'base64');

    // 2) 품질 평가
    const quality = await assessCropQuality(cropBuffer);

    // 3) 업스케일 시도 (품질 사용 가능할 때만)
    let upscaledBase64 = pipelineData.image_base64;
    let upscaledSize: { width: number; height: number; scale: number } = {
      width: pipelineData.width,
      height: pipelineData.height,
      scale: 1,
    };

    if (quality.isUsable) {
      const upscaleResult = await tryUpscaleCrop(cropBuffer);
      if (upscaleResult) {
        upscaledBase64 = upscaleResult.upscaled.base64;
        upscaledSize = {
          width: upscaleResult.upscaled.width,
          height: upscaleResult.upscaled.height,
          scale: upscaleResult.upscaled.scale,
        };
      }
    }

    // 4) Phase 2 폴백 권장 여부 — 품질 점수 낮으면 true
    const nanobananaFallbackNeeded = !quality.isUsable || quality.score < 0.55;

    return NextResponse.json({
      success: true,
      imageBase64: upscaledBase64,
      originalSize: { width: pipelineData.width, height: pipelineData.height },
      upscaledSize,
      quality: {
        score: quality.score,
        isUsable: quality.isUsable,
        reason: quality.reason,
      },
      nanobananaFallbackNeeded,
      pageCount: pipelineData.page_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[crop-figure] error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
