// ============================================================================
// EVPM (Enhanced Visual Prompt Markup) — Visual Prompting 오케스트레이터
// 수학 그래프/도형 이미지에 시각적 주석을 추가하여 VLM 인식률 향상
//
// 파이프라인:
//   원본 이미지 → YOLO 서버 /annotate → 주석 이미지 → VLM 재호출
//
// Phase 1 (MVP): 저신뢰 결과에 대해 주석 이미지로 재시도
// Phase 2: 그래프 문제 사전 주석 (예정)
// Phase 3: YOLO 서브피겨 감지 연동 (예정)
// ============================================================================

import type { InterpretedFigure, FigureType } from '@/types/ocr';

// ============================================================================
// Configuration
// ============================================================================

const YOLO_SERVER_URL = process.env.YOLO_SERVER_URL || 'http://localhost:8100';
const VP_TIMEOUT_MS = parseInt(process.env.VP_TIMEOUT_MS || '15000');

/** VP 재시도를 트리거하는 최소 confidence 임계값 */
const VP_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.VP_CONFIDENCE_THRESHOLD || '0.6'
);

/** VP 적용 대상 figureType (이 타입들에만 VP 재시도) */
const VP_TARGET_TYPES: FigureType[] = ['graph', 'geometry'];

/** VP가 최소 이만큼 confidence가 높아야 채택 */
const VP_MIN_IMPROVEMENT = 0.05;

// ============================================================================
// Types
// ============================================================================

export interface VPAnnotation {
  type: 'grid' | 'axes' | 'ticks' | 'label' | 'highlight' | 'numbered_box' | 'origin';
  [key: string]: unknown;
}

export interface VPAnnotateResponse {
  annotated_base64: string;  // data:image/png;base64,...
  annotations_used: VPAnnotation[];
  inference_ms: number;
  image_size: { width: number; height: number };
  axes_detected?: { cx: number; cy: number };
}

export interface VPResult {
  applied: boolean;
  annotatedImageUrl?: string;
  annotationsUsed?: VPAnnotation[];
  axesDetected?: { cx: number; cy: number };
  annotateMs?: number;
  originalConfidence: number;
  newConfidence?: number;
  improvement?: number;
}

// ============================================================================
// 핵심 판단 함수
// ============================================================================

/**
 * Vision AI 결과를 보고 VP 재시도가 필요한지 판단.
 *
 * 조건:
 * 1. confidence < VP_CONFIDENCE_THRESHOLD (기본 0.6)
 * 2. figureType이 VP_TARGET_TYPES에 포함 (graph, geometry)
 * 3. photo가 아닌 경우 (photo는 VP로 개선 불가)
 */
export function shouldRetryWithVP(result: InterpretedFigure): boolean {
  // photo는 VP 대상이 아님
  if (result.figureType === 'photo') return false;

  // 이미 높은 confidence면 스킵
  if (result.confidence >= VP_CONFIDENCE_THRESHOLD) return false;

  // 대상 타입 체크
  if (!VP_TARGET_TYPES.includes(result.figureType)) return false;

  return true;
}

/**
 * 문제 텍스트에서 그래프 키워드를 감지하여 사전 VP 적용 여부 결정.
 * (Phase 2용 — 현재는 미사용)
 */
export function shouldApplyVPProactively(context?: string): boolean {
  if (!context) return false;

  const graphKeywords = [
    '좌표', '그래프', 'y=', 'f(x)', '함수', '포물선',
    '직선', '접선', '기울기', '절편', 'x축', 'y축',
    '이차함수', '삼차함수', '지수함수', '로그함수', '삼각함수',
    'sin', 'cos', 'tan', 'log',
  ];

  const lowerContext = context.toLowerCase();
  return graphKeywords.some(kw => lowerContext.includes(kw));
}

// ============================================================================
// YOLO 서버 /annotate 호출
// ============================================================================

/**
 * YOLO 서버의 /annotate 엔드포인트를 호출하여 주석된 이미지를 받아온다.
 *
 * @param imageBase64 - 원본 이미지 (data:image/...;base64,... 또는 raw base64)
 * @param options - 주석 옵션 (preset 또는 수동 annotations)
 * @returns 주석된 이미지 base64 또는 null (서버 미가동/에러 시)
 */
export async function callAnnotateAPI(
  imageBase64: string,
  options?: {
    preset?: 'math_graph' | 'detection';
    annotations?: VPAnnotation[] | Record<string, unknown>[];
    autoDetectAxes?: boolean;
  }
): Promise<VPAnnotateResponse | null> {
  try {
    // Health check
    const healthRes = await fetch(`${YOLO_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) {
      console.log(`[VP] YOLO server not available (health check failed)`);
      return null;
    }
  } catch {
    console.log(`[VP] YOLO server not reachable`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('image_base64', imageBase64);

    if (options?.preset) {
      formData.append('preset', options.preset);
    }
    if (options?.annotations) {
      formData.append('annotations', JSON.stringify(options.annotations));
    }
    if (options?.autoDetectAxes) {
      formData.append('auto_detect_axes', 'true');
    }

    const response = await fetch(`${YOLO_SERVER_URL}/annotate`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(VP_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[VP] /annotate failed: ${response.status} ${errText}`);
      return null;
    }

    const data = await response.json() as VPAnnotateResponse;
    console.log(`[VP] /annotate OK: ${data.image_size.width}x${data.image_size.height}, ${data.annotations_used.length} annotations, ${data.inference_ms}ms`);
    return data;
  } catch (err) {
    console.warn(`[VP] /annotate error:`, err);
    return null;
  }
}

// ============================================================================
// VP 강화 프롬프트
// ============================================================================

/**
 * VP 주석이 포함된 이미지를 위한 추가 프롬프트 생성.
 * VLM에게 주석의 의미를 설명하여 더 정확한 해석을 유도.
 */
export function createVPEnhancedPrompt(
  annotations: VPAnnotation[],
  axesDetected?: { cx: number; cy: number },
): string {
  const parts: string[] = [];

  parts.push(`\n\n★★ 시각적 주석 안내 (EVPM):`);
  parts.push(`이 이미지에는 분석을 돕기 위한 시각적 주석이 추가되어 있습니다.`);

  const hasGrid = annotations.some(a => a.type === 'grid');
  const hasAxes = annotations.some(a => a.type === 'axes');
  const hasOrigin = annotations.some(a => a.type === 'origin');
  const hasNumberedBox = annotations.some(a => a.type === 'numbered_box');
  const labels = annotations.filter(a => a.type === 'label');

  if (hasGrid) {
    parts.push(`- 연한 격자선이 오버레이되어 있습니다. 좌표 단위를 읽는 데 활용하세요.`);
  }
  if (hasAxes) {
    parts.push(`- 빨간 직선이 x축과 y축을 표시합니다.`);
    if (axesDetected) {
      parts.push(`  (자동 감지된 축 위치: x=${(axesDetected.cx * 100).toFixed(0)}%, y=${(axesDetected.cy * 100).toFixed(0)}%)`);
    }
  }
  if (hasOrigin) {
    parts.push(`- 빨간 십자 마크와 "O"가 원점을 표시합니다.`);
  }
  if (hasNumberedBox) {
    const boxes = annotations.filter(a => a.type === 'numbered_box');
    parts.push(`- ${boxes.length}개의 번호가 매겨진 색상 박스가 개별 요소를 표시합니다.`);
    parts.push(`  각 번호의 영역에 무엇이 있는지 정확히 읽어주세요.`);
  }
  if (labels.length > 0) {
    parts.push(`- ${labels.length}개의 텍스트 라벨이 추가되어 있습니다.`);
  }

  parts.push(`주석은 참고용입니다. 원본 이미지의 실제 내용에 집중하되, 주석을 좌표/구조 파악에 활용하세요.`);

  return parts.join('\n');
}

// ============================================================================
// VP 결과 비교 (confidence 기반)
// ============================================================================

/**
 * VP 적용 전/후 결과를 비교하여 더 나은 결과를 선택.
 *
 * @param original - VP 없이 해석한 결과
 * @param vpResult - VP 주석 이미지로 해석한 결과
 * @returns 채택할 결과 ('original' | 'vp')와 이유
 */
export function compareResults(
  original: InterpretedFigure,
  vpResult: InterpretedFigure,
): { winner: 'original' | 'vp'; reason: string } {
  // VP 결과가 photo면 원본 유지
  if (vpResult.figureType === 'photo') {
    return { winner: 'original', reason: 'VP result is photo (unusable)' };
  }

  // VP가 원본보다 confidence가 충분히 높으면 채택
  const improvement = vpResult.confidence - original.confidence;
  if (improvement >= VP_MIN_IMPROVEMENT) {
    return {
      winner: 'vp',
      reason: `VP confidence higher: ${original.confidence.toFixed(2)} → ${vpResult.confidence.toFixed(2)} (+${improvement.toFixed(2)})`,
    };
  }

  // VP 결과가 같은 figureType이고 rendering이 더 완전하면 채택
  if (vpResult.figureType === original.figureType && vpResult.rendering) {
    const origRendering = original.rendering;
    if (!origRendering) {
      return { winner: 'vp', reason: 'VP has rendering data, original does not' };
    }

    // graph인 경우: expressions 수 비교
    if (vpResult.figureType === 'graph') {
      const vpExpr = (vpResult.rendering as { expressions?: unknown[] })?.expressions?.length || 0;
      const origExpr = (origRendering as { expressions?: unknown[] })?.expressions?.length || 0;
      if (vpExpr > origExpr) {
        return { winner: 'vp', reason: `VP has more expressions: ${origExpr} → ${vpExpr}` };
      }
    }
  }

  // 원본이 photo인데 VP가 아닌 경우 (타입 시스템상 여기 도달 불가하지만 방어적)
  if ((original.figureType as string) === 'photo' && (vpResult.figureType as string) !== 'photo') {
    return { winner: 'vp', reason: `VP classified as ${vpResult.figureType} (original was photo)` };
  }

  return { winner: 'original', reason: `No significant improvement (${improvement.toFixed(2)})` };
}

// ============================================================================
// 통합 VP 파이프라인
// ============================================================================

/**
 * Visual Prompting 전체 파이프라인 실행.
 *
 * 1. 원본 이미지를 YOLO /annotate로 주석 처리
 * 2. 주석 이미지를 data URI로 반환 (VLM 재호출은 caller가 수행)
 *
 * @param imageBase64 - 원본 이미지 base64 (data: prefix 포함 가능)
 * @param originalResult - 원본 Vision AI 결과 (판단용)
 * @param context - 문제 텍스트 (키워드 감지용)
 * @returns VP 결과 정보
 */
export async function applyVisualPrompting(
  imageBase64: string,
  originalResult: InterpretedFigure,
  context?: string,
): Promise<VPResult> {
  const baseResult: VPResult = {
    applied: false,
    originalConfidence: originalResult.confidence,
  };

  // 1. VP 필요성 판단
  if (!shouldRetryWithVP(originalResult)) {
    console.log(`[VP] Skip: confidence=${originalResult.confidence.toFixed(2)}, type=${originalResult.figureType}`);
    return baseResult;
  }

  console.log(`[VP] ★ Applying VP: confidence=${originalResult.confidence.toFixed(2)}, type=${originalResult.figureType}`);

  // 2. 프리셋 결정
  const isGraph = originalResult.figureType === 'graph' ||
    (context ? shouldApplyVPProactively(context) : false);

  // 3. /annotate 호출
  const annotateResult = await callAnnotateAPI(imageBase64, {
    preset: isGraph ? 'math_graph' : undefined,
    autoDetectAxes: isGraph || undefined,
  });

  if (!annotateResult) {
    console.log(`[VP] /annotate failed, skipping VP`);
    return baseResult;
  }

  // 4. 결과 반환 (VLM 재호출은 caller가 수행)
  return {
    applied: true,
    annotatedImageUrl: annotateResult.annotated_base64,
    annotationsUsed: annotateResult.annotations_used,
    axesDetected: annotateResult.axes_detected,
    annotateMs: annotateResult.inference_ms,
    originalConfidence: originalResult.confidence,
  };
}
