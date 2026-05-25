// ============================================================================
// science-gemini-flow — 과학 자산화 파이프라인 (YOLO + per-problem Gemini, 모드 B)
// ============================================================================
//
// /api/workflow/upload-science-perproblem 의 핵심 로직을 함수로 추출.
// processJobInBackground 에서 subjectArea === 'science' 일 때 호출.
//
// 흐름 (모드 B):
//   1) image-pipeline /render-pdf-pages → 페이지별 PNG
//   2) YOLO /detect → 문제 bbox (실패/0건 시 Gemini segmenter 폴백)
//      ★ 비용 절감 + 일관성 향상 — 페이지당 Gemini 호출 1회 제거.
//   3) 각 문제 crop → Gemini per-problem (텍스트) + /detect-figures-cv (figure)
//   4) LLMAnalysisResult[] 로 변환 → analyze 페이지가 그대로 렌더
//
// ★ 수학 영향 0 — 신규 함수, subjectArea === 'science' 일 때만 호출됨.
// ★ SCIENCE_USE_GEMINI=true env 활성화 시에만 실행 (feature flag 안전망).
// ★ YOLO production = HF Spaces snaker1107/gwasaram-yolo (CLASS 0='problem'),
//   환경변수 YOLO_SERVER_URL 로 주입. 미연결/0건이면 Gemini segmenter 자동 폴백.
// ============================================================================

import sharp from 'sharp';
import { extractOneScienceProblemWithGemini } from '@/lib/ocr/gemini-science-perproblem';
import { segmentSciencePageWithGemini } from '@/lib/ocr/gemini-science-segmenter';
import { supabaseAdmin } from '@/lib/supabase/server';
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

// ===== YOLO segmenter (모드 B) =====
const YOLO_SERVER_URL = process.env.YOLO_SERVER_URL || 'http://localhost:8100';
const YOLO_CONFIDENCE = parseFloat(process.env.YOLO_CONFIDENCE_THRESHOLD || '0.25');
const YOLO_TIMEOUT_MS = parseInt(process.env.YOLO_TIMEOUT_MS || '15000');

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
 * @param jobId      Job ID (YOLO 학습 데이터 저장용 — 페이지 이미지 storage path 의 식별자)
 * @returns LLMAnalysisResult[] — 기존 analyze 페이지 호환
 */
export async function processScienceWithGemini(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  callbacks: ScienceFlowCallbacks = {},
  jobId?: string,
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

  // ===== 2) 페이지별 YOLO → 문제 bbox (실패/0건 시 Gemini segmenter 폴백) =====
  //   ★ 모드 B 핵심: 페이지 segmentation 을 YOLO 로 이관 → Gemini 호출 N→0 (페이지당).
  //   ★ 폴백 보장: YOLO 헬스/모델/검출 실패 시 Gemini segmenter 사용 → 가용성 유지.
  const allBboxes: ProblemBBox[] = [];
  const bboxSourceMap = new Map<number, 'yolo' | 'gemini'>(); // 페이지별 검출 출처 (학습 데이터 source 구분용)
  let globalIdx = 0;
  let yoloPageCount = 0;
  let geminiFallbackPageCount = 0;
  await Promise.all(
    pages.map(async (page) => {
      let bboxes: Array<{ x: number; y: number; w: number; h: number }> = [];
      let source: 'yolo' | 'gemini' = 'yolo';

      // 1차: YOLO segmenter
      const yoloResult = await detectProblemsWithYolo(page);
      if (yoloResult && yoloResult.bboxes.length > 0) {
        bboxes = yoloResult.bboxes;
        source = 'yolo';
        yoloPageCount += 1;
        console.log(
          `[science-gemini-flow] page ${page.pageIdx + 1}: YOLO ${bboxes.length}건 (${yoloResult.inferenceMs}ms)`,
        );
      } else {
        // 2차 폴백: Gemini segmenter (YOLO 미배포·모델 미로딩·0건 검출 등)
        try {
          const pageBuf = Buffer.from(page.imageBase64, 'base64');
          const seg = await segmentSciencePageWithGemini(pageBuf);
          bboxes = seg.bboxes;
          source = 'gemini';
          geminiFallbackPageCount += 1;
          console.log(
            `[science-gemini-flow] page ${page.pageIdx + 1}: Gemini segmenter ${bboxes.length}건 (YOLO 폴백)`,
          );
        } catch (err) {
          console.warn(`[science-gemini-flow] page ${page.pageIdx + 1} Gemini segmenter도 실패:`, err);
          return;
        }
      }

      bboxSourceMap.set(page.pageIdx, source);
      const sorted = [...bboxes].sort((a, b) => a.y - b.y);
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
    }),
  );

  // 페이지 순서 → 문제 번호 hint 부여
  allBboxes.sort((a, b) => a.pageIdx - b.pageIdx || a.y - b.y);
  for (const b of allBboxes) {
    globalIdx += 1;
    b.numberHint = globalIdx;
  }

  console.log(
    `[science-gemini-flow] segmenter 결과: 총 ${allBboxes.length}문제 (YOLO 페이지 ${yoloPageCount}, Gemini 폴백 ${geminiFallbackPageCount})`,
  );
  onProgress?.(25);

  if (allBboxes.length === 0) {
    onStatusChange?.('FAILED', '문제 영역 검출 실패');
    return [];
  }

  // ===== 2.5) YOLO 학습 데이터 누적 — AUTO_GEMINI 어노테이션 저장 =====
  //   목적: 향후 과학용 YOLO 모델 학습을 위한 데이터 축적 (현재 production 검출은 Gemini 사용)
  //   - 페이지 이미지를 Supabase Storage 업로드
  //   - 각 bbox 를 detection_annotations 에 저장 (problem_id NULL, 자산화 후 매칭)
  //   - class_label='science_problem' (수학과 별도, 시험지 형식 다름)
  //   - detection_source='AUTO_GEMINI' (수동 검수된 MANUAL 과 구분)
  //   ★ 실패해도 메인 흐름 영향 X (try/catch 격리). 학습 데이터 누적은 best-effort.
  if (jobId && supabaseAdmin) {
    try {
      await saveScienceAnnotationsForTraining(jobId, pages, allBboxes, bboxSourceMap);
    } catch (annErr) {
      console.warn('[science-gemini-flow] 어노테이션 저장 실패 (무시):', annErr);
    }
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
 * YOLO 학습 데이터 누적 — 검출 bbox 를 detection_annotations 에 누적 저장.
 *
 * 흐름:
 *   1) 각 페이지 이미지를 Supabase Storage 에 업로드 (`page-images/{jobId}/page-{N}.png`)
 *   2) 각 bbox 를 detection_annotations 에 INSERT
 *      - class_label='science_problem' (수학 'problem' 과 분리)
 *      - detection_source: 페이지의 검출 출처별 — 'AUTO_YOLO' / 'AUTO_GEMINI'
 *      - problem_id=NULL (자산화 시 매칭 가능하지만 학습용으론 페이지+bbox 면 충분)
 *
 * 모드 B 전환 후:
 *   - YOLO 가 검출한 페이지 → AUTO_YOLO (재학습 시 self-distillation 위험 → 가중치 ↓)
 *   - Gemini 폴백 페이지 → AUTO_GEMINI (재학습 핵심 데이터, 가중치 ↑)
 *
 * ★ 실패해도 메인 흐름 영향 X (caller 에서 try/catch 격리).
 */
async function saveScienceAnnotationsForTraining(
  jobId: string,
  pages: PageData[],
  bboxes: ProblemBBox[],
  bboxSourceMap: Map<number, 'yolo' | 'gemini'>,
): Promise<void> {
  if (!supabaseAdmin) {
    console.warn('[science-gemini-flow:training] supabaseAdmin 없음 — 학습 데이터 저장 스킵');
    return;
  }

  // 1) 페이지 이미지 storage 업로드 (병렬)
  const pageImagePathMap = new Map<number, { path: string; width: number; height: number }>();
  await Promise.all(
    pages.map(async (page) => {
      const pageNum = page.pageIdx + 1; // 1-based
      const storagePath = `page-images/${jobId}/page-${pageNum}.png`;
      try {
        const buffer = Buffer.from(page.imageBase64, 'base64');
        const { error } = await supabaseAdmin!.storage
          .from('source-files')
          .upload(storagePath, buffer, {
            contentType: 'image/png',
            upsert: true,
          });
        if (error) {
          console.warn(`[science-gemini-flow:training] 페이지 ${pageNum} 업로드 실패:`, error.message);
          return;
        }
        pageImagePathMap.set(pageNum, {
          path: storagePath,
          width: page.width,
          height: page.height,
        });
      } catch (err) {
        console.warn(`[science-gemini-flow:training] 페이지 ${pageNum} 처리 오류:`, err);
      }
    }),
  );

  // 2) 어노테이션 INSERT (각 bbox)
  const annotationsToInsert = bboxes
    .map((bbox) => {
      const pageNum = bbox.pageIdx + 1;
      const pageInfo = pageImagePathMap.get(pageNum);
      if (!pageInfo) return null; // 페이지 업로드 실패한 건 스킵
      const pageSource = bboxSourceMap.get(bbox.pageIdx);
      return {
        problem_id: null, // 자산화 전이라 problem_id 없음. job_id + page + bbox 로 매칭 가능
        exam_id: null,
        job_id: jobId,
        page_number: pageNum,
        page_image_path: pageInfo.path,
        page_width: pageInfo.width,
        page_height: pageInfo.height,
        bbox_x: bbox.x,
        bbox_y: bbox.y,
        bbox_w: bbox.w,
        bbox_h: bbox.h,
        class_label: 'science_problem',
        problem_number: bbox.numberHint,
        detection_source: pageSource === 'yolo' ? 'AUTO_YOLO' : 'AUTO_GEMINI',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (annotationsToInsert.length === 0) {
    console.log('[science-gemini-flow:training] 저장할 annotation 없음 (페이지 업로드 모두 실패)');
    return;
  }

  const { error: insErr } = await supabaseAdmin
    .from('detection_annotations')
    .insert(annotationsToInsert);

  if (insErr) {
    console.warn('[science-gemini-flow:training] annotation INSERT 실패:', insErr.message);
  } else {
    console.log(
      `[science-gemini-flow:training] ✅ ${annotationsToInsert.length}개 science_problem annotation 저장 (job ${jobId})`,
    );
  }
}

/**
 * 페이지 이미지를 YOLO 서버 (/detect) 로 보내 'problem' bbox 검출.
 *
 * 응답 규약 (yolo-server/server.py):
 *   - problems: [{x, y, w, h, confidence, class='problem'}]  ← 모두 top-left normalized (0~1)
 *   - others:   [{...class='graph'|'table'}]
 *
 * 폴백 트리거 (null 반환 → caller 가 Gemini segmenter 사용):
 *   - 헬스체크 실패 / 모델 미로딩
 *   - /detect HTTP 에러
 *   - 검출 0건 (과학 시험지 형식 미학습 페이지 가능성)
 *   - 네트워크 timeout / 예외
 *
 * ★ production YOLO = HF Spaces (snaker1107/gwasaram-yolo) — Vercel env YOLO_SERVER_URL 필수.
 */
async function detectProblemsWithYolo(
  page: PageData,
): Promise<{ bboxes: Array<{ x: number; y: number; w: number; h: number }>; inferenceMs: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOLO_TIMEOUT_MS);
  try {
    // 헬스체크 — 미배포/미로딩 즉시 폴백
    const healthRes = await fetch(`${YOLO_SERVER_URL}/health`, { signal: controller.signal });
    if (!healthRes.ok) return null;
    const health = await healthRes.json();
    if (!health.model_loaded) return null;

    const formData = new FormData();
    formData.append('image_base64', page.imageBase64);
    formData.append('confidence', String(YOLO_CONFIDENCE));
    formData.append('page_number', String(page.pageIdx + 1));

    const detectRes = await fetch(`${YOLO_SERVER_URL}/detect`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!detectRes.ok) return null;

    const data = await detectRes.json();
    const problems = (data.problems || []) as Array<{ x: number; y: number; w: number; h: number }>;
    if (problems.length === 0) return null;

    return {
      bboxes: problems.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
      inferenceMs: data.inference_ms || 0,
    };
  } catch (err) {
    console.warn(
      `[science-gemini-flow] YOLO page ${page.pageIdx + 1} 호출 실패:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
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
