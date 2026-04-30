// ============================================================================
// Exam AI Analysis Types — 시험지 단위 AI 분석 결과
// (시험 총평 / 단원별 학습전략 / 고난도 문항 심층분석)
// ============================================================================

/** 전반적 난이도 평가 */
export type OverallDifficulty = '평이' | '보통' | '난이도 있음' | '매우 난이도 있음';

/** 단원별 분석 — 출제경향 + 대비전략 */
export interface UnitAnalysis {
  /** 대단원명 (예: '다항식의 연산') */
  majorUnit: string;
  /** 이 단원에 속한 문제 번호 (시험지 내 출제 순서) */
  questionNumbers: number[];
  /** ★ 출제경향 — 이 단원이 이번 시험에서 어떻게 출제됐는지 (keyPoints 필드 재사용) */
  keyPoints: string;
  /** 대비전략 — 학습 가이드 */
  strategy: string;
}

/** 고난도 문항 심층분석 */
export interface HardQuestionAnalysis {
  /** problems.id (UUID) */
  problemId: string;
  /** 시험지 내 문제 번호 */
  number: number;
  /** ★ 단원·핵심 주제 (예: '제곱근을 포함한 식의 자연수 조건') — optional */
  subTitle?: string;
  /** 출제 의도 */
  intent: string;
  /** 공략(해결 전략) — [1단계] [2단계] [3단계] 단계별 표기 권장. LaTeX 가능 */
  strategy: string;
}

/** 시험지 단위 AI 분석 결과 (exams.ai_analysis JSONB에 저장) */
export interface ExamAIAnalysis {
  /** 시험 총평 (3~5문장) */
  summary: string;
  /** 전반적 난이도 평가 */
  overallDifficulty: OverallDifficulty;
  /** 단원별 학습전략 (대단원 단위) */
  unitAnalyses: UnitAnalysis[];
  /** 고난도 문항 심층분석 (난이도 7+ 상위 N) */
  hardQuestions: HardQuestionAnalysis[];
  /** ISO timestamp */
  generatedAt: string;
  /** 생성 모델 표기 (예: 'claude-sonnet-4-6') */
  modelVersion: string;
}

/** AI 분석 생성 요청 옵션 */
export interface GenerateAnalysisOptions {
  /** 강제 재생성 (캐시 무시) */
  force?: boolean;
  /** 고난도 임계값 (기본 7) */
  hardDifficultyThreshold?: number;
  /** 고난도 최대 개수 (기본 4) */
  hardQuestionLimit?: number;
}
