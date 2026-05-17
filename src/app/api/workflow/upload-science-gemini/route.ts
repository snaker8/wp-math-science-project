// ============================================================================
// POST /api/workflow/upload-science-gemini
// ============================================================================
//
// 과학 자산화 OCR 을 Gemini 2.5 Pro Vision 으로 교체하는 POC endpoint.
//
// 입력: multipart/form-data
//   - file: PDF or image (Buffer 로 받아 Gemini inlineData 로 전달)
//
// 출력: ScienceGeminiOCRResult (JSON)
//
// ★ 수학 영향 0 — 새 endpoint, 기존 라우트 미수정.
// ★ DB 저장 X — 결과 그대로 JSON 응답. 품질 평가 후 통합 결정.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { extractScienceProblemsWithGemini } from '@/lib/ocr/gemini-science';
import type { ScienceGeminiOCRResult, ScienceCVPageFigures } from '@/types/science-ocr';

// Vercel Functions 기본 timeout 300s — Gemini 2.5 Pro 가 큰 PDF 처리할 때 여유.
export const maxDuration = 300;

const IMAGE_PIPELINE_URL = process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';
const CV_DETECT_TIMEOUT_MS = 60_000;

/**
 * image-pipeline /detect-figures-cv 호출 — OpenCV 가 페이지별 그림 bbox + crop 반환.
 * 실패해도 메인 응답 막지 않음 (Gemini 텍스트 결과는 그대로 반환).
 */
async function callDetectFiguresCV(buffer: Buffer, mimeType: string): Promise<ScienceCVPageFigures[] | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CV_DETECT_TIMEOUT_MS);

    const res = await fetch(`${IMAGE_PIPELINE_URL}/detect-figures-cv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: buffer.toString('base64'),
        mime_type: mimeType,
        dpi: 300,
        include_crops: true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[upload-science-gemini] CV detect 실패:', res.status, errText.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const pages = (data.pages || []) as Array<{
      page_idx: number;
      width: number;
      height: number;
      figures: Array<{
        x: number; y: number; w: number; h: number;
        crop_base64?: string;
        crop_width?: number;
        crop_height?: number;
      }>;
    }>;
    return pages.map((p) => ({
      pageIdx: p.page_idx,
      width: p.width,
      height: p.height,
      figures: p.figures.map((f) => ({
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        cropBase64: f.crop_base64,
        cropWidth: f.crop_width,
        cropHeight: f.crop_height,
      })),
    }));
  } catch (err) {
    console.warn('[upload-science-gemini] CV detect 에러:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ScienceGeminiOCRResult>> {
  const startedAt = Date.now();

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          model: '',
          problems: [],
          usage: {},
          elapsedMs: Date.now() - startedAt,
          error: 'multipart/form-data 의 "file" 필드가 필요합니다 (PDF 또는 이미지).',
        },
        { status: 400 },
      );
    }

    // MIME 추정: 브라우저가 비워두면 확장자로 폴백
    const fileName = file.name || 'upload';
    const isPdf = fileName.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

    const buffer = Buffer.from(await file.arrayBuffer());

    console.log(`[upload-science-gemini] file=${fileName} mime=${mimeType} size=${buffer.length}`);

    // ★ Gemini OCR + OpenCV 그림 검출 병렬 실행
    //   - Gemini: 텍스트·choices·번호 (사용자 검증 기준 잘 됨)
    //   - OpenCV: 그림 bbox + crop PNG (LLM 환각 회피, 픽셀 분석 기반)
    const [ocrResult, cvFigures] = await Promise.all([
      extractScienceProblemsWithGemini(buffer, mimeType),
      callDetectFiguresCV(buffer, mimeType),
    ]);

    const elapsedMs = Date.now() - startedAt;

    const cvFigureCount = cvFigures?.reduce((sum, p) => sum + p.figures.length, 0) ?? 0;
    console.log(
      `[upload-science-gemini] done in ${elapsedMs}ms — ${ocrResult.problems.length} problems, ` +
      `${cvFigureCount} CV figures across ${cvFigures?.length ?? 0} pages, ` +
      `tokens: in=${ocrResult.usage.promptTokens} out=${ocrResult.usage.candidatesTokens} ` +
      `thinking=${ocrResult.usage.thoughtsTokens ?? 0}`,
    );

    return NextResponse.json({
      success: true,
      model: ocrResult.model,
      problems: ocrResult.problems,
      cvPageFigures: cvFigures || undefined,
      usage: ocrResult.usage,
      elapsedMs,
      finishReason: ocrResult.finishReason,
      // ★ POC: 디버깅 편의로 원본 응답 텍스트도 포함. 통합 시 제거.
      rawResponseText: ocrResult.rawResponseText.length < 50000 ? ocrResult.rawResponseText : undefined,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-science-gemini] error:', message);
    return NextResponse.json(
      {
        success: false,
        model: '',
        problems: [],
        usage: {},
        elapsedMs,
        error: message,
      },
      { status: 500 },
    );
  }
}
