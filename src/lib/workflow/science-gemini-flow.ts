// ============================================================================
// science-gemini-flow — 과학 자산화 Gemini 파이프라인 (분석 페이지 통합용)
// ============================================================================
//
// /api/workflow/upload-science-perproblem 의 핵심 로직을 함수로 추출.
// processJobInBackground 에서 subjectArea === 'science' 일 때 호출.
//
// 흐름:
//   1) image-pipeline /render-pdf-pages → 페이지별 PNG
//   2) Gemini segmenter → 문제 bbox
//   3) 각 문제 crop → Gemini per-problem (텍스트) + /detect-figures-cv (figure)
//   4) LLMAnalysisResult[] 로 변환 → analyze 페이지가 그대로 렌더
//
// ★ 수학 영향 0 — 신규 함수, subjectArea === 'science' 일 때만 호출됨.
// ★ SCIENCE_USE_GEMINI=true env 활성화 시에만 실행 (feature flag 안전망).
// ============================================================================

import sharp from 'sharp';
import { extractOneScienceProblemWithGemini } from '@/lib/ocr/gemini-science-perproblem';
import { segmentSciencePageWithGemini } from '@/lib/ocr/gemini-science-segmenter';
import type {
  LLMAnalysisResult,
  TypeClassification,
  StepByStepSolution,
  ProcessingStatus,
} from '@/types/workflow';

const IMAGE_PIPELINE_URL = process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';
const RENDER_DPI = parseInt(process.env.SCIENCE_RENDER_DPI || '300');
const GEMINI_CONCURRENCY = parseInt(process.env.GEMINI_SCIENCE_CONCURRENCY || '4');
const PIPELINE_TIMEOUT_MS = 120_000;

export interface ScienceFlowCallbacks {
  onStatusChange?: (status: ProcessingStatus, step: string) => void;
  onProgress?: (progress: number) => void;
  onPartialResult?: (results: LLMAnalysisResult[]) => void;
}

interface PageData {
  pageIdx: number;
  width: number;
  height: number;
  imageBase64: string;
}

interface ProblemBBox {
  pageIdx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  numberHint: number;
}

interface CVFigure {
  x: number;
  y: number;
  w: number;
  h: number;
  cropBase64?: string;
}

/**
 * 과학 자산화 — Gemini Vision + OpenCV figure 검출 통합 처리.
 *
 * @param fileBuffer PDF 또는 이미지 ArrayBuffer
 * @param mimeType   'application/pdf' 또는 'image/*'
 * @param callbacks  진행 상황 콜백
 * @returns LLMAnalysisResult[] — 기존 analyze 페이지 호환
 */
export async function processScienceWithGemini(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  callbacks: ScienceFlowCallbacks = {},
): Promise<LLMAnalysisResult[]> {
  const { onStatusChange, onProgress, onPartialResult } = callbacks;
  const buffer = Buffer.from(fileBuffer);
  const isPdf = mimeType.includes('pdf');

  onStatusChange?.('OCR_PROCESSING', '페이지 렌더링 중...');
  onProgress?.(5);

  // ===== 1) 페이지별 PNG 렌더링 =====
  const pages = await renderPages(buffer, isPdf);
  onProgress?.(15);
  onStatusChange?.('OCR_PROCESSING', `${pages.length}개 페이지 → 문제 영역 검출 중...`);

  // ===== 2) 페이지별 Gemini segmenter → 문제 bbox =====
  const allBboxes: ProblemBBox[] = [];
  let globalIdx = 0;
  await Promise.all(
    pages.map(async (page) => {
      try {
        const pageBuf = Buffer.from(page.imageBase64, 'base64');
        const seg = await segmentSciencePageWithGemini(pageBuf);
        const sorted = [...seg.bboxes].sort((a, b) => a.y - b.y);
        for (const b of sorted) {
          allBboxes.push({
            pageIdx: page.pageIdx,
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            numberHint: 0, // 글로벌 인덱스로 나중에 재할당
          });
        }
      } catch (err) {
        console.warn(`[science-gemini-flow] page ${page.pageIdx} segment 실패:`, err);
      }
    }),
  );

  // 페이지 순서 → 문제 번호 hint 부여
  allBboxes.sort((a, b) => a.pageIdx - b.pageIdx || a.y - b.y);
  for (const b of allBboxes) {
    globalIdx += 1;
    b.numberHint = globalIdx;
  }

  console.log(`[science-gemini-flow] segmenter: 총 ${allBboxes.length}문제`);
  onProgress?.(25);

  if (allBboxes.length === 0) {
    onStatusChange?.('FAILED', '문제 영역 검출 실패');
    return [];
  }

  // ===== 3) 각 문제 crop → 병렬 Gemini per-problem + OpenCV figure =====
  onStatusChange?.('LLM_ANALYZING', `${allBboxes.length}개 문제 분석 중...`);

  const partialResults: LLMAnalysisResult[] = [];
  const totalChunks = Math.ceil(allBboxes.length / GEMINI_CONCURRENCY);

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const chunkStart = chunkIdx * GEMINI_CONCURRENCY;
    const chunkBboxes = allBboxes.slice(chunkStart, chunkStart + GEMINI_CONCURRENCY);

    await Promise.all(
      chunkBboxes.map(async (bbox) => {
        const page = pages.find((p) => p.pageIdx === bbox.pageIdx);
        if (!page) return;

        try {
          // 문제 영역 crop
          const padPct = 0.01;
          const px = Math.max(0, bbox.x - padPct);
          const py = Math.max(0, bbox.y - padPct);
          const pw = Math.min(1 - px, bbox.w + 2 * padPct);
          const ph = Math.min(1 - py, bbox.h + 2 * padPct);

          const cropLeft = Math.round(px * page.width);
          const cropTop = Math.round(py * page.height);
          const cropWidth = Math.round(pw * page.width);
          const cropHeight = Math.round(ph * page.height);

          const pageBuffer = Buffer.from(page.imageBase64, 'base64');
          const cropBuf = await sharp(pageBuffer)
            .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
            .png()
            .toBuffer();

          // 병렬: Gemini per-problem + OpenCV figure
          const [geminiResult, cvFigures] = await Promise.all([
            extractOneScienceProblemWithGemini(cropBuf, 'image/png', bbox.numberHint),
            detectFiguresInCrop(cropBuf),
          ]);

          // LLMAnalysisResult 변환
          const problemNumber = geminiResult.problem.number || bbox.numberHint;
          const result = buildLLMAnalysisResult(
            problemNumber,
            geminiResult.problem.content,
            geminiResult.problem.choices,
            geminiResult.problem.hasFigure,
            geminiResult.problem.pointsHint,
            geminiResult.problem.answerHint,
            geminiResult.problem.confidence,
            bbox.pageIdx,
            { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
            cvFigures,
          );

          partialResults.push(result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[science-gemini-flow] 문제 ${bbox.numberHint} 처리 실패:`, errMsg);
          // ★ "텍스트 사라짐" 사고 방지 (2026-05-18):
          //   실패 시 빈 본문 대신 에러 메시지 박음 → 사용자가 카드에서 원인 확인 후
          //   수정 모달에서 수동 보정 가능. 침묵 실패 방지.
          partialResults.push(
            buildLLMAnalysisResult(
              bbox.numberHint,
              `[자동 OCR 실패 — 수동 입력 필요]\n에러: ${errMsg.slice(0, 200)}`,
              [],
              false,
              undefined,
              undefined,
              0,
              bbox.pageIdx,
              { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
              [],
            ),
          );
        }
      }),
    );

    // 청크 단위 진행률 업데이트 + partial 결과 보고
    const done = Math.min(allBboxes.length, (chunkIdx + 1) * GEMINI_CONCURRENCY);
    const progress = 25 + Math.round((done / allBboxes.length) * 65); // 25% → 90%
    onProgress?.(progress);
    // 정렬해서 partialResult 전달 (UI 가 번호 순서로 표시)
    const sorted = [...partialResults].sort((a, b) => (a.problemNumber || 0) - (b.problemNumber || 0));
    onPartialResult?.(sorted);
  }

  // ===== 4) 완료 정렬 + 반환 =====
  partialResults.sort((a, b) => (a.problemNumber || 0) - (b.problemNumber || 0));
  onProgress?.(95);
  onStatusChange?.('COMPLETED', '과학 자산화 완료');
  onProgress?.(100);

  return partialResults;
}

/**
 * PDF 면 image-pipeline /render-pdf-pages, 이미지면 PNG 재인코딩 + 다운스케일.
 *
 * ★ 큰 이미지 사고 (2026-05-18):
 *   - 모바일 사진(4000~6000px) 또는 고해상도 스캔본 그대로 Gemini 에 보내면
 *     20MB inlineData 한계 초과 → 호출 실패 → empty content placeholder → "텍스트 사라짐"
 *   - 또한 PNG/JPEG/WebP/HEIC 등 다양한 포맷이 들어오는데 mimeType 을 'image/png' 로
 *     강제 송신하던 사고
 *   - 해결: max 2400px 다운스케일 + sharp 로 PNG 통일 재인코딩
 */
async function renderPages(buffer: Buffer, isPdf: boolean): Promise<PageData[]> {
  if (isPdf) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
    const res = await fetch(`${IMAGE_PIPELINE_URL}/render-pdf-pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_base64: buffer.toString('base64'), dpi: RENDER_DPI }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`render-pdf-pages 실패: ${res.status}`);
    const data = await res.json();
    const pages = (data.pages || []) as Array<{ page_idx: number; width: number; height: number; image_base64: string }>;
    return pages.map((p) => ({
      pageIdx: p.page_idx,
      width: p.width,
      height: p.height,
      imageBase64: p.image_base64,
    }));
  } else {
    // 이미지 입력 — 다운스케일 + PNG 통일 재인코딩
    const meta0 = await sharp(buffer).metadata();
    const MAX_DIM = 2400;
    const w0 = meta0.width || 0;
    const h0 = meta0.height || 0;
    const needsResize = w0 > MAX_DIM || h0 > MAX_DIM;

    let pipeline = sharp(buffer);
    if (needsResize) {
      console.log(`[science-gemini-flow] 이미지 다운스케일: ${w0}x${h0} → max ${MAX_DIM}px`);
      pipeline = pipeline.resize({
        width: MAX_DIM,
        height: MAX_DIM,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const workingBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
    const meta = await sharp(workingBuffer).metadata();

    return [
      {
        pageIdx: 0,
        width: meta.width || 0,
        height: meta.height || 0,
        imageBase64: workingBuffer.toString('base64'),
      },
    ];
  }
}

/**
 * 문제 crop 안에서 OpenCV 그림 검출 (lenient 모드).
 */
async function detectFiguresInCrop(cropBuf: Buffer): Promise<CVFigure[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${IMAGE_PIPELINE_URL}/detect-figures-cv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: cropBuf.toString('base64'),
        mime_type: 'image/png',
        dpi: 300,
        include_crops: true,
        strict_filter: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const data = await res.json();
    const pages = (data.pages || []) as Array<{
      figures: Array<{ x: number; y: number; w: number; h: number; crop_base64?: string }>;
    }>;
    return pages.flatMap((p) => p.figures).map((f) => ({
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      cropBase64: f.crop_base64,
    }));
  } catch (err) {
    console.warn('[science-gemini-flow] detect-figures-cv 에러:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Gemini per-problem 결과 → LLMAnalysisResult 변환.
 *
 * 분류·풀이는 비워서 반환 — 사용자가 분석 페이지에서 수동 보정 또는
 * 자동 분류 API 별도 호출.
 */
function buildLLMAnalysisResult(
  problemNumber: number,
  content: string,
  choices: string[],
  hasFigure: boolean,
  pointsHint: number | undefined,
  _answerHint: string | undefined,
  confidence: number | undefined,
  pageIdx: number,
  bbox: { x: number; y: number; w: number; h: number },
  cvFigures: CVFigure[],
): LLMAnalysisResult {
  // 빈 분류·풀이 — 분석 페이지에서 사용자가 채움
  const emptyClassification: TypeClassification = {
    typeCode: '',
    typeName: '',
    subject: '과학',
    chapter: '',
    section: '',
    difficulty: 3,
    cognitiveDomain: 'UNDERSTANDING',
    confidence: confidence ?? 0,
    prerequisites: [],
  };
  const emptySolution: StepByStepSolution = {
    approach: '',
    steps: [],
    finalAnswer: '',
  };

  // ★ figure 임베드 (2026-05-19): cvFigures crop 을 content 끝에 `![이미지](data:...)`
  //   마커로 자동 삽입. saveEditedProblemsDirect 가 base64 마커를 Storage 업로드 +
  //   figure_crop 타입으로 자동 변환 → 자산화 시 그림이 DB에 살아남음.
  //   "자산화 시 이미지 크롭이 작동 안 했던 거 같다" 사고 차단.
  let contentWithFigures = content;
  if (cvFigures.length > 0) {
    const figureMarkers = cvFigures
      .filter((f) => f.cropBase64)
      .map((f) => `\n\n![이미지](data:image/png;base64,${f.cropBase64})`)
      .join('');
    if (figureMarkers) {
      contentWithFigures = content + figureMarkers;
    }
  }

  return {
    problemId: `science-${Date.now()}-${problemNumber}`,
    problemNumber,
    contentWithMath: contentWithFigures,
    contentMmd: contentWithFigures,
    choices,
    pageIndex: pageIdx,
    bbox,
    hasFigure,
    classification: emptyClassification,
    solution: emptySolution,
    similarTypes: [],
    keywordsTags: [],
    estimatedTimeMinutes: 3,
    analyzedAt: new Date().toISOString(),
    // ★ 비표준 확장 필드 — analyze 페이지가 무시해도 안전. 미래 통합 시 사용.
    ...(pointsHint && pointsHint > 0 ? { _scienceScore: pointsHint } : {}),
    ...(cvFigures.length > 0 ? { _scienceCvFigures: cvFigures } : {}),
  } as LLMAnalysisResult;
}
