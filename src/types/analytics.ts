// ============================================================================
// Analytics Types - 학생 분석 및 히트맵 관련 타입 정의
// ============================================================================

// 4단계 채점 상태
export type GradingStatus = 'CORRECT' | 'PARTIAL_CORRECT' | 'PARTIAL_WRONG' | 'WRONG';

// 채점 상태별 가중치 (점수)
export const GRADING_WEIGHTS: Record<GradingStatus, number> = {
  CORRECT: 100,
  PARTIAL_CORRECT: 70,
  PARTIAL_WRONG: 30,
  WRONG: 0,
};

// 숙달도 레벨
export type MasteryLevel = 'danger' | 'warning' | 'good';

// 숙달도 레벨 임계값
export const MASTERY_THRESHOLDS = {
  danger: 30,   // 0~30%: 위험 (빨강)
  warning: 70,  // 31~70%: 주의 (노랑)
  good: 100,    // 71~100%: 양호 (초록)
};

// 숙달도 레벨별 색상
export const MASTERY_COLORS: Record<MasteryLevel, { bg: string; text: string; border: string }> = {
  danger: {
    bg: '#FEE2E2',      // red-100
    text: '#DC2626',    // red-600
    border: '#FECACA',  // red-200
  },
  warning: {
    bg: '#FEF3C7',      // amber-100
    text: '#D97706',    // amber-600
    border: '#FDE68A',  // amber-200
  },
  good: {
    bg: '#D1FAE5',      // emerald-100
    text: '#059669',    // emerald-600
    border: '#A7F3D0',  // emerald-200
  },
};

// 히트맵 셀 데이터
export interface HeatmapCell {
  id: string;
  typeCode: string;           // 유형 코드
  typeName: string;           // 유형명
  chapter: string;            // 단원
  section?: string;           // 소단원
  subject: string;            // 과목

  // 통계
  totalAttempts: number;      // 총 시도 횟수
  correctCount: number;       // 정답 수
  partialCorrectCount: number; // 부분정답 수
  partialWrongCount: number;  // 부분오답 수
  wrongCount: number;         // 오답 수

  // 계산된 값
  masteryScore: number;       // 숙달도 점수 (0~100)
  masteryLevel: MasteryLevel; // 숙달도 레벨
  avgTimeSeconds?: number;    // 평균 풀이 시간

  // 추세
  recentTrend?: 'improving' | 'stable' | 'declining';
  lastAttemptAt?: string;
}

// 히트맵 행 (단원/챕터별 그룹)
export interface HeatmapRow {
  chapter: string;
  subject: string;
  cells: HeatmapCell[];
  avgMastery: number;         // 행 평균 숙달도
}

// 히트맵 전체 데이터
export interface HeatmapData {
  studentId: string;
  studentName: string;
  rows: HeatmapRow[];
  summary: {
    totalTypes: number;
    dangerCount: number;      // 위험 유형 수
    warningCount: number;     // 주의 유형 수
    goodCount: number;        // 양호 유형 수
    overallMastery: number;   // 전체 평균 숙달도
  };
  lastUpdated: string;
}

// 유사 문제 생성 요청
export interface TwinGenerationRequest {
  typeCode: string;
  difficulty?: number;
  count?: number;
}

// 학생 분석 필터
export interface AnalyticsFilter {
  studentId: string;
  subject?: string;
  chapter?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  minAttempts?: number;
}

// 난이도×인지영역 매트릭스 셀
export interface DifficultyMatrixCell {
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  totalAttempts: number;
  correctRate: number;
  avgTimeSeconds?: number;
}

// 인지영역 한글명
export const COGNITIVE_DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};
