// ============================================================================
// POST /api/workflow/upload-science-perproblem
// ============================================================================
//
// 과학 자산화 per-problem POC.
//
// 흐름:
//   1) PDF/이미지 업로드
//   2) image-pipeline /render-pdf-pages 로 페이지별 PNG 렌더 (이미지면 그대로 사용)
//   3) 각 페이지를 YOLO /detect-problems-yolo 호출 → 문제 bbox 배열
//   4) 각 문제 bbox 로 sharp 크롭 → 문제 단위 crop PNG
//   5) 각 crop 을 Gemini 2.5 Pro (per-problem) 병렬 호출
//   6) 결과 합쳐서 응답
//
// 통짜(/upload-science-gemini) 대비:
//   - 호출 수: 1 → N (문제 수)
//   - 정확도: 큰 페이지 분석 → 작은 crop 분석으로 ↑↑
//   - 좌표 환각: 0 (좌표 안 묻고 분할 자체로 위치 확보)
//   - 그림 좌표: 안 묻음 (사용자가 UI 에서 수동 크롭)
//
// ★ 수학 영향 0 — 신규 endpoint, 기존 라우트 미수정.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { extractOneScienceProblemWithGemini } from '@/lib/ocr/gemini-science-perproblem';
import { segmentSciencePageWithGemini } from '@/lib/ocr/gemini-science-segmenter';

const IMAGE_PIPELINE_URL = process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';
const YOLO_RENDER_DPI = parseInt(process.env.YOLO_RENDER_DPI || '300');
const PIPELINE_TIMEOUT_MS = 120_000;
// 동시 Gemini 호출 제한 — Google API rate limit + 메모리 보호.
//   Gemini 2.5 Pro 무료 티어 15 RPM. 결제 시 1000+ RPM 가능.
const GEMINI_CONCURRENCY = parseInt(process.env.GEMINI_SCIENCE_CONCURRENCY || '4');

export const maxDuration = 300;

interface ProblemBBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
  class?: string;
}

interface PageData {
  pageIdx: number;
  width: number;
  height: number;
  imageBase64: string;
  problems: ProblemBBox[];
}

interface PerProblemFigure {
  /** 문제 crop 안 정규화 좌표 (0~1) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** OpenCV 가 잘라낸 그림 PNG base64 */
  cropBase64?: string;
  cropWidth?: number;
  cropHeight?: number;
}

interface PerProblemResponseItem {
  number: number;
  content: string;
  choices: string[];
  hasFigure: boolean;
  pointsHint?: number;
  answerHint?: string;
  confidence?: number;
  /** 어느 페이지 */
  pageIdx: number;
  /** 페이지 내 정규화 bbox */
  bbox: { x: number; y: number; w: number; h: number };
  /** Gemini segmenter 가 검출한 ranking 순서 (위→아래) */
  detectionIdx: number;
  /** 문제 crop 의 base64 PNG — UI 에서 카드에 표시 */
  problemCropBase64: string;
  /** OpenCV 가 문제 안에서 검출한 그림들 — bbox 는 문제 crop 안 정규화 */
  figures?: PerProblemFigure[];
  /** Gemini 호출 실패 시 채워짐 */
  error?: string;
}

interface APIResponse {
  success: boolean;
  problems: PerProblemResponseItem[];
  pageCount: number;
  problemCount: number;
  model?: string;
  totalUsage: {
    promptTokens: number;
    candidatesTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
  };
  elapsedMs: number;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<APIResponse>> {
  const startedAt = Date.now();

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        emptyResponse(false, '"file" 필드가 필요합니다 (PDF 또는 이미지).', startedAt),
        { status: 400 },
      );
    }

    const fileName = file.name || 'upload';
    const isPdf = fileName.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');
    const buffer = Buffer.from(await file.arrayBuffer());

    console.log(`[upload-science-perproblem] file=${fileName} mime=${mimeType} size=${buffer.length}`);

    // ===== 1. 페이지별 PNG 렌더링 =====
    const pages = await renderPages(buffer, mimeType, isPdf);
    console.log(`[upload-science-perproblem] rendered ${pages.length} pages`);

    // ===== 2. 각 페이지마다 Gemini segmenter 호출 → 문제 bbox =====
    //   수학 YOLO 는 과학 시험지 인식 못 함 → Gemini Vision 으로 직접 분할.
    //   각 페이지의 모든 문제 영역만 좌표로 반환 (내용 OCR 없음, 작은 prompt 라 빠름)
    const totalSegUsage = { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
    await Promise.all(
      pages.map(async (page) => {
        try {
          const pageBuffer = Buffer.from(page.imageBase64, 'base64');
          const segResult = await segmentSciencePageWithGemini(pageBuffer);
          totalSegUsage.promptTokens += segResult.usage.promptTokens || 0;
          totalSegUsage.candidatesTokens += segResult.usage.candidatesTokens || 0;
          totalSegUsage.thoughtsTokens += segResult.usage.thoughtsTokens || 0;
          totalSegUsage.totalTokens += segResult.usage.totalTokens || 0;
          page.problems = segResult.bboxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
          console.log(`[upload-science-perproblem] page ${page.pageIdx}: Gemini ${segResult.bboxes.length}개 문제 검출`);
        } catch (err) {
          console.warn(`[upload-science-perproblem] Gemini segment 에러 page ${page.pageIdx}:`, err);
          page.problems = [];
        }
      }),
    );

    const totalProblems = pages.reduce((sum, p) => sum + p.problems.length, 0);
    console.log(`[upload-science-perproblem] segmenter 결과: 총 ${totalProblems}문제`);

    if (totalProblems === 0) {
      return NextResponse.json({
        success: false,
        problems: [],
        pageCount: pages.length,
        problemCount: 0,
        totalUsage: totalSegUsage,
        elapsedMs: Date.now() - startedAt,
        error: 'Gemini 분할자가 문제 영역을 검출하지 못했습니다. PDF/이미지 확인 필요.',
      });
    }

    // ===== 3. 각 문제 crop → 병렬 Gemini 호출 =====
    type Task = {
      pageIdx: number;
      detectionIdx: number;
      bbox: ProblemBBox;
      page: PageData;
      expectedNumber: number;
    };

    const tasks: Task[] = [];
    let globalIdx = 0;
    for (const page of pages) {
      // ★ y 좌표로 정렬 (위→아래) — 문제 번호 순서와 매핑하기 위함
      const sortedProblems = [...page.problems].sort((a, b) => a.y - b.y);
      for (let i = 0; i < sortedProblems.length; i++) {
        globalIdx += 1;
        tasks.push({
          pageIdx: page.pageIdx,
          detectionIdx: i,
          bbox: sortedProblems[i],
          page,
          expectedNumber: globalIdx,
        });
      }
    }

    const results: PerProblemResponseItem[] = new Array(tasks.length);
    const totalUsage = { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
    let usedModel = '';

    // 동시성 제한 — 4개씩 chunk
    for (let i = 0; i < tasks.length; i += GEMINI_CONCURRENCY) {
      const chunk = tasks.slice(i, i + GEMINI_CONCURRENCY);
      await Promise.all(
        chunk.map(async (task, j) => {
          const idx = i + j;
          try {
            // 페이지 PNG 에서 문제 영역 crop (sharp)
            const pageBuffer = Buffer.from(task.page.imageBase64, 'base64');
            const padPct = 0.01;
            const px = Math.max(0, task.bbox.x - padPct);
            const py = Math.max(0, task.bbox.y - padPct);
            const pw = Math.min(1 - px, task.bbox.w + 2 * padPct);
            const ph = Math.min(1 - py, task.bbox.h + 2 * padPct);

            const cropLeft = Math.round(px * task.page.width);
            const cropTop = Math.round(py * task.page.height);
            const cropWidth = Math.round(pw * task.page.width);
            const cropHeight = Math.round(ph * task.page.height);

            const cropBuf = await sharp(pageBuffer)
              .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
              .png()
              .toBuffer();

            const cropBase64 = cropBuf.toString('base64');

            // ★ Gemini per-problem + OpenCV 그림 검출 병렬 실행
            //   - Gemini: 텍스트·choices·번호
            //   - OpenCV (strict_filter=false): 문제 안 figure 추출. 헤더 노이즈 없으니
            //     <보기> 같은 텍스트 박스도 포함될 수 있음 — lenient 모드.
            const [geminiResult, cvFigures] = await Promise.all([
              extractOneScienceProblemWithGemini(cropBuf, 'image/png', task.expectedNumber),
              detectFiguresInCrop(cropBuf),
            ]);

            totalUsage.promptTokens += geminiResult.usage.promptTokens || 0;
            totalUsage.candidatesTokens += geminiResult.usage.candidatesTokens || 0;
            totalUsage.thoughtsTokens += geminiResult.usage.thoughtsTokens || 0;
            totalUsage.totalTokens += geminiResult.usage.totalTokens || 0;
            usedModel = geminiResult.model;

            results[idx] = {
              number: geminiResult.problem.number || task.expectedNumber,
              content: geminiResult.problem.content,
              choices: geminiResult.problem.choices,
              hasFigure: geminiResult.problem.hasFigure,
              pointsHint: geminiResult.problem.pointsHint,
              answerHint: geminiResult.problem.answerHint,
              confidence: geminiResult.problem.confidence,
              pageIdx: task.pageIdx,
              bbox: { x: task.bbox.x, y: task.bbox.y, w: task.bbox.w, h: task.bbox.h },
              detectionIdx: task.detectionIdx,
              problemCropBase64: cropBase64,
              figures: cvFigures,
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[upload-science-perproblem] 문제 ${task.expectedNumber} 처리 실패:`, message);
            results[idx] = {
              number: task.expectedNumber,
              content: '',
              choices: [],
              hasFigure: false,
              pageIdx: task.pageIdx,
              bbox: { x: task.bbox.x, y: task.bbox.y, w: task.bbox.w, h: task.bbox.h },
              detectionIdx: task.detectionIdx,
              problemCropBase64: '',
              error: message,
            };
          }
        }),
      );
    }

    // 번호 순 정렬 (Gemini 가 반환한 number 기준, 동률 시 expectedNumber)
    results.sort((a, b) => a.number - b.number);

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[upload-science-perproblem] done in ${elapsedMs}ms — ${results.length} problems, ` +
      `tokens: in=${totalUsage.promptTokens} out=${totalUsage.candidatesTokens} thinking=${totalUsage.thoughtsTokens}`,
    );

    // segmenter usage 합산
    totalUsage.promptTokens += totalSegUsage.promptTokens;
    totalUsage.candidatesTokens += totalSegUsage.candidatesTokens;
    totalUsage.thoughtsTokens += totalSegUsage.thoughtsTokens;
    totalUsage.totalTokens += totalSegUsage.totalTokens;

    return NextResponse.json({
      success: true,
      problems: results,
      pageCount: pages.length,
      problemCount: results.length,
      model: usedModel,
      totalUsage,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-science-perproblem] error:', message);
    return NextResponse.json(
      emptyResponse(false, message, startedAt),
      { status: 500 },
    );
  }
}

/**
 * 문제 crop 이미지 안에서 OpenCV 그림 검출 (lenient 모드 — 텍스트 박스도 포함 가능).
 * 실패해도 빈 배열 반환 — 전체 흐름 막지 않음.
 */
async function detectFiguresInCrop(cropBuf: Buffer): Promise<PerProblemFigure[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${IMAGE_PIPELINE_URL}/detect-figures-cv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: cropBuf.toString('base64'),
        mime_type: 'image/png',
        dpi: 300,                  // 이미지 입력이라 무시되지만 형식상 전달
        include_crops: true,
        strict_filter: false,      // 문제 영역 안 — <보기> 텍스트 박스도 보존
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const data = await res.json();
    const pages = (data.pages || []) as Array<{
      figures: Array<{
        x: number; y: number; w: number; h: number;
        crop_base64?: string;
        crop_width?: number;
        crop_height?: number;
      }>;
    }>;
    const figs = pages.flatMap((p) => p.figures);
    return figs.map((f) => ({
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      cropBase64: f.crop_base64,
      cropWidth: f.crop_width,
      cropHeight: f.crop_height,
    }));
  } catch (err) {
    console.warn('[upload-science-perproblem] detect-figures-cv 에러:', err instanceof Error ? err.message : err);
    return [];
  }
}

function emptyResponse(success: boolean, error: string, startedAt: number): APIResponse {
  return {
    success,
    problems: [],
    pageCount: 0,
    problemCount: 0,
    totalUsage: { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 },
    elapsedMs: Date.now() - startedAt,
    error,
  };
}

/**
 * PDF 면 image-pipeline /render-pdf-pages 로 페이지별 PNG 렌더,
 * 이미지면 그대로 1페이지로 처리.
 */
async function renderPages(buffer: Buffer, mimeType: string, isPdf: boolean): Promise<PageData[]> {
  if (isPdf) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);

    const res = await fetch(`${IMAGE_PIPELINE_URL}/render-pdf-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: buffer.toString('base64'),
        dpi: YOLO_RENDER_DPI,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`render-pdf-pages 실패 (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const pages = (data.pages || []) as Array<{ page_idx: number; width: number; height: number; image_base64: string }>;

    return pages.map((p) => ({
      pageIdx: p.page_idx,
      width: p.width,
      height: p.height,
      imageBase64: p.image_base64,
      problems: [],
    }));
  } else {
    // 이미지 1장 → 그대로
    const meta = await sharp(buffer).metadata();
    return [
      {
        pageIdx: 0,
        width: meta.width || 0,
        height: meta.height || 0,
        imageBase64: buffer.toString('base64'),
        problems: [],
      },
    ];
  }
}
