// ============================================================================
// Deep Grading - 4단계 정밀 채점 시스템
// ============================================================================

import type { GradingStatus, GradingRecord } from '@/types/workflow';

// ============================================================================
// 채점 가중치 설정
// ============================================================================

export const GRADING_WEIGHTS: Record<GradingStatus, number> = {
  CORRECT: 100,        // 정답
  PARTIAL_CORRECT: 70, // 부분정답 (상)
  PARTIAL_WRONG: 30,   // 부분오답 (하)
  WRONG: 0,            // 오답
};

export const GRADING_LABELS: Record<GradingStatus, string> = {
  CORRECT: '정답',
  PARTIAL_CORRECT: '부분정답',
  PARTIAL_WRONG: '부분오답',
  WRONG: '오답',
};

export const GRADING_COLORS: Record<GradingStatus, { bg: string; text: string; border: string }> = {
  CORRECT: { bg: '#dcfce7', text: '#16a34a', border: '#22c55e' },
  PARTIAL_CORRECT: { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },
  PARTIAL_WRONG: { bg: '#ffedd5', text: '#ea580c', border: '#f97316' },
  WRONG: { bg: '#fee2e2', text: '#dc2626', border: '#ef4444' },
};

export const GRADING_ICONS: Record<GradingStatus, string> = {
  CORRECT: '✓',
  PARTIAL_CORRECT: '△',
  PARTIAL_WRONG: '▽',
  WRONG: '✗',
};

// ============================================================================
// 숙달도 계산
// ============================================================================

export interface MasteryCalculation {
  totalScore: number;
  maxScore: number;
  percentage: number;
  level: 'danger' | 'warning' | 'good';
  breakdown: {
    correct: number;
    partialCorrect: number;
    partialWrong: number;
    wrong: number;
  };
}

export function calculateMastery(records: GradingRecord[]): MasteryCalculation {
  if (records.length === 0) {
    return {
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
      level: 'danger',
      breakdown: { correct: 0, partialCorrect: 0, partialWrong: 0, wrong: 0 },
    };
  }

  const breakdown = {
    correct: 0,
    partialCorrect: 0,
    partialWrong: 0,
    wrong: 0,
  };

  let totalScore = 0;

  for (const record of records) {
    totalScore += GRADING_WEIGHTS[record.status];

    switch (record.status) {
      case 'CORRECT':
        breakdown.correct++;
        break;
      case 'PARTIAL_CORRECT':
        breakdown.partialCorrect++;
        break;
      case 'PARTIAL_WRONG':
        breakdown.partialWrong++;
        break;
      case 'WRONG':
        breakdown.wrong++;
        break;
    }
  }

  const maxScore = records.length * 100;
  const percentage = Math.round((totalScore / maxScore) * 100);

  let level: 'danger' | 'warning' | 'good';
  if (percentage <= 30) {
    level = 'danger';
  } else if (percentage <= 70) {
    level = 'warning';
  } else {
    level = 'good';
  }

  return {
    totalScore,
    maxScore,
    percentage,
    level,
    breakdown,
  };
}

// ============================================================================
// 유형별 숙달도 집계
// ============================================================================

export interface TypeMastery {
  typeCode: string;
  typeName: string;
  subject: string;
  chapter: string;
  mastery: MasteryCalculation;
  records: GradingRecord[];
  lastGradedAt?: string;
}

export function aggregateByType(
  records: GradingRecord[],
  problemTypeMap: Map<string, { typeCode: string; typeName: string; subject: string; chapter: string }>
): TypeMastery[] {
  // 유형별로 그룹화
  const typeGroups = new Map<string, GradingRecord[]>();

  for (const record of records) {
    const problemInfo = problemTypeMap.get(record.problemId);
    if (!problemInfo) continue;

    const { typeCode } = problemInfo;
    if (!typeGroups.has(typeCode)) {
      typeGroups.set(typeCode, []);
    }
    typeGroups.get(typeCode)!.push(record);
  }

  // 각 유형별 숙달도 계산
  const results: TypeMastery[] = [];

  for (const [typeCode, typeRecords] of typeGroups) {
    const problemInfo = problemTypeMap.get(typeRecords[0].problemId);
    if (!problemInfo) continue;

    const sortedRecords = typeRecords.sort(
      (a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime()
    );

    results.push({
      typeCode,
      typeName: problemInfo.typeName,
      subject: problemInfo.subject,
      chapter: problemInfo.chapter,
      mastery: calculateMastery(typeRecords),
      records: sortedRecords,
      lastGradedAt: sortedRecords[0]?.gradedAt,
    });
  }

  return results.sort((a, b) => a.mastery.percentage - b.mastery.percentage);
}

// ============================================================================
// 오답 문제 추출
// ============================================================================

export interface WrongProblem {
  problemId: string;
  record: GradingRecord;
  typeCode: string;
  typeName: string;
}

export function extractWrongProblems(
  records: GradingRecord[],
  problemTypeMap: Map<string, { typeCode: string; typeName: string; subject: string; chapter: string }>
): WrongProblem[] {
  return records
    .filter((r) => r.status === 'WRONG')
    .map((record) => {
      const problemInfo = problemTypeMap.get(record.problemId);
      return {
        problemId: record.problemId,
        record,
        typeCode: problemInfo?.typeCode || 'UNKNOWN',
        typeName: problemInfo?.typeName || '알 수 없는 유형',
      };
    });
}

// ============================================================================
// 실시간 히트맵 업데이트용 이벤트
// ============================================================================

export type GradingEventType = 'GRADE_ADDED' | 'GRADE_UPDATED' | 'GRADE_DELETED';

export interface GradingEvent {
  type: GradingEventType;
  studentId: string;
  record: GradingRecord;
  timestamp: string;
}

// EventEmitter 패턴 (클라이언트용)
type GradingEventHandler = (event: GradingEvent) => void;
const eventHandlers = new Set<GradingEventHandler>();

export function subscribeToGradingEvents(handler: GradingEventHandler): () => void {
  eventHandlers.add(handler);
  return () => eventHandlers.delete(handler);
}

export function emitGradingEvent(event: GradingEvent): void {
  eventHandlers.forEach((handler) => handler(event));
}

// ============================================================================
// 유틸리티
// ============================================================================

export function getGradingStatusFromScore(score: number): GradingStatus {
  if (score >= 90) return 'CORRECT';
  if (score >= 60) return 'PARTIAL_CORRECT';
  if (score >= 20) return 'PARTIAL_WRONG';
  return 'WRONG';
}

export function formatMasteryPercentage(percentage: number): string {
  return `${percentage}%`;
}

export function getMasteryColor(level: 'danger' | 'warning' | 'good'): string {
  const colors = {
    danger: '#ef4444',
    warning: '#f59e0b',
    good: '#22c55e',
  };
  return colors[level];
}
