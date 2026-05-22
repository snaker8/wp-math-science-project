// ============================================================================
// Science OCR (Gemini Vision) — POC Types
// ============================================================================
//
// 과학 자산화 Gemini 교체 실험 (PR claude/science-gemini-poc).
// 수학 라인(`src/types/ocr.ts`) 과 완전 분리.
//
// 흐름: PDF/이미지 → Gemini 2.5 Pro Vision → 구조화 JSON (이 타입)
//   기존 Mathpix(`mathpix-science.ts`) + 파서(`question-parser-science.ts`) 894줄을
//   Gemini 단일 호출 + responseSchema 강제 JSON 으로 대체.
// ============================================================================

/**
 * 삽화 bbox — Gemini 가 반환하는 그림/표/실험장치 위치
 * 좌표는 페이지 정규화(0~1). 실제 크롭은 /api/workflow/crop-figure 에서
 * PDF 페이지 렌더링 후 sharp 로 잘라낸다.
 */
export interface ScienceFigureBBox {
  /** PDF 페이지 인덱스 (0-based) */
  pageIdx: number;
  /** 좌상단 X (0~1, 페이지 너비 정규화) */
  x: number;
  /** 좌상단 Y (0~1) */
  y: number;
  /** 너비 (0~1) */
  w: number;
  /** 높이 (0~1) */
  h: number;
  /**
   * 본문 안 어느 위치(문자 인덱스 또는 문장 끝 번호)에 삽입할지 hint.
   * 0=본문 맨 앞, 1=첫 문장 끝, ... — 렌더러가 inline 삽입에 사용.
   */
  placement?: number;
  /** 디버그용 설명 (예: '회로도', '세포 분열 그림') */
  descriptionHint?: string;
}

/** Gemini 가 직접 뱉는 문제 단위 */
export interface ScienceGeminiProblem {
  /** 문제 번호 (시험지 표면에 적힌 번호 그대로, 1~30) */
  number: number;
  /** 문제 본문 LaTeX (수식은 $...$ 인라인 / $$...$$ 디스플레이) */
  content: string;
  /** 객관식 선택지 — 텍스트만. 비어있으면 서답형. */
  choices: string[];
  /** 도형/실험 그림/표 포함 여부 — true 면 이후 figure crop 단계 진입 */
  hasFigure: boolean;
  /**
   * 삽화 bbox 배열 — 한 문제에 그림이 여러 개일 수 있음 (예: 실험장치 + 결과그래프).
   * hasFigure=true 일 때만 채워짐.
   */
  figures?: ScienceFigureBBox[];
  /** 페이지 번호 (1-based) — Gemini 가 추정 */
  pageHint?: number;
  /** 배점 (있으면) — 본문 [N점] 패턴에서 추출 */
  pointsHint?: number;
  /** 정답이 시험지에 노출돼있으면 (해설지 동봉 등) — 보통 빈 문자열 */
  answerHint?: string;
}

/** OpenCV 가 검출한 페이지별 그림 (Gemini bbox 환각 우회용) */
export interface ScienceCVPageFigures {
  pageIdx: number;
  width: number;
  height: number;
  figures: Array<{
    /** 페이지 정규화 좌표 */
    x: number;
    y: number;
    w: number;
    h: number;
    /** 크롭된 PNG base64 (raw, no prefix) */
    cropBase64?: string;
    cropWidth?: number;
    cropHeight?: number;
  }>;
}

/** POC endpoint 최종 응답 */
export interface ScienceGeminiOCRResult {
  success: boolean;
  /** Gemini 호출 사용 모델 (예: gemini-2.5-pro) */
  model: string;
  /** 문제 배열 */
  problems: ScienceGeminiProblem[];
  /**
   * ★ OpenCV 가 검출한 페이지별 그림 — Gemini 의 bbox 환각 우회.
   * 페이지 PNG 에 OpenCV CC 분석 + 텍스트 필터링으로 추출. ~95% 정확.
   * 텍스트 (Gemini) 와 별개 트랙으로 사용 — UI 에서 사용자가 매칭/조정.
   */
  cvPageFigures?: ScienceCVPageFigures[];
  /** Gemini 토큰 사용량 (비용 계산용) */
  usage: {
    promptTokens?: number;
    candidatesTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
  };
  /** 총 소요 시간 (ms) */
  elapsedMs: number;
  /** finishReason — 'STOP' 이면 정상, 'MAX_TOKENS' 면 잘림 */
  finishReason?: string;
  /** 디버그: 원본 Gemini 응답 텍스트 (실패 분석용) */
  rawResponseText?: string;
  error?: string;
}
