// ============================================================================
// Heatmap Analytics Utilities
// 학생 채점 데이터를 히트맵 형식으로 집계하는 유틸리티
// ============================================================================

import type {
  GradingStatus,
  HeatmapCell,
  HeatmapRow,
  HeatmapData,
  MasteryLevel,
} from '@/types/analytics';
import { GRADING_WEIGHTS, MASTERY_THRESHOLDS } from '@/types/analytics';

// 원시 채점 데이터 (DB에서 조회한 형태)
export interface RawAnswerData {
  studentId: string;
  problemId: string;
  typeCode: string;
  typeName: string;
  chapter: string;
  section?: string;
  subject: string;
  gradingStatus: GradingStatus;
  timeSpentSeconds?: number;
  answeredAt: string;
}

/**
 * 숙달도 점수 계산
 * 가중치: 정답(100), 부분정답(70), 부분오답(30), 오답(0)
 */
export function calculateMasteryScore(
  correctCount: number,
  partialCorrectCount: number,
  partialWrongCount: number,
  wrongCount: number
): number {
  const total = correctCount + partialCorrectCount + partialWrongCount + wrongCount;

  if (total === 0) return 0;

  const weightedSum =
    correctCount * GRADING_WEIGHTS.CORRECT +
    partialCorrectCount * GRADING_WEIGHTS.PARTIAL_CORRECT +
    partialWrongCount * GRADING_WEIGHTS.PARTIAL_WRONG +
    wrongCount * GRADING_WEIGHTS.WRONG;

  return Math.round((weightedSum / total) * 100) / 100;
}

/**
 * 숙달도 레벨 결정
 */
export function getMasteryLevel(score: number): MasteryLevel {
  if (score <= MASTERY_THRESHOLDS.danger) return 'danger';
  if (score <= MASTERY_THRESHOLDS.warning) return 'warning';
  return 'good';
}

/**
 * 원시 데이터를 히트맵 셀로 집계
 */
export function aggregateToHeatmapCells(rawData: RawAnswerData[]): HeatmapCell[] {
  // 유형별로 그룹화
  const typeGroups = new Map<string, RawAnswerData[]>();

  rawData.forEach((item) => {
    const key = item.typeCode;
    if (!typeGroups.has(key)) {
      typeGroups.set(key, []);
    }
    typeGroups.get(key)!.push(item);
  });

  // 각 유형별 통계 계산
  const cells: HeatmapCell[] = [];

  typeGroups.forEach((items, typeCode) => {
    const first = items[0];

    // 채점 상태별 카운트
    let correctCount = 0;
    let partialCorrectCount = 0;
    let partialWrongCount = 0;
    let wrongCount = 0;
    let totalTime = 0;
    let timeCount = 0;

    items.forEach((item) => {
      switch (item.gradingStatus) {
        case 'CORRECT':
          correctCount++;
          break;
        case 'PARTIAL_CORRECT':
          partialCorrectCount++;
          break;
        case 'PARTIAL_WRONG':
          partialWrongCount++;
          break;
        case 'WRONG':
          wrongCount++;
          break;
      }

      if (item.timeSpentSeconds) {
        totalTime += item.timeSpentSeconds;
        timeCount++;
      }
    });

    const masteryScore = calculateMasteryScore(
      correctCount,
      partialCorrectCount,
      partialWrongCount,
      wrongCount
    );

    // 최근 시도 날짜
    const sortedByDate = [...items].sort(
      (a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime()
    );

    cells.push({
      id: `${first.studentId}-${typeCode}`,
      typeCode,
      typeName: first.typeName,
      chapter: first.chapter,
      section: first.section,
      subject: first.subject,
      totalAttempts: items.length,
      correctCount,
      partialCorrectCount,
      partialWrongCount,
      wrongCount,
      masteryScore,
      masteryLevel: getMasteryLevel(masteryScore),
      avgTimeSeconds: timeCount > 0 ? Math.round(totalTime / timeCount) : undefined,
      lastAttemptAt: sortedByDate[0]?.answeredAt,
    });
  });

  return cells;
}

/**
 * 히트맵 셀을 행(단원별)으로 그룹화
 */
export function groupCellsIntoRows(cells: HeatmapCell[]): HeatmapRow[] {
  // 단원별로 그룹화
  const chapterGroups = new Map<string, HeatmapCell[]>();

  cells.forEach((cell) => {
    const key = `${cell.subject}::${cell.chapter}`;
    if (!chapterGroups.has(key)) {
      chapterGroups.set(key, []);
    }
    chapterGroups.get(key)!.push(cell);
  });

  // 행 생성
  const rows: HeatmapRow[] = [];

  chapterGroups.forEach((groupCells, key) => {
    const [subject, chapter] = key.split('::');

    // 행 평균 숙달도 계산
    const avgMastery =
      groupCells.reduce((sum, cell) => sum + cell.masteryScore, 0) / groupCells.length;

    rows.push({
      chapter,
      subject,
      cells: groupCells.sort((a, b) => a.typeName.localeCompare(b.typeName)),
      avgMastery: Math.round(avgMastery * 100) / 100,
    });
  });

  // 과목, 단원 순으로 정렬
  return rows.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.chapter.localeCompare(b.chapter);
  });
}

/**
 * 전체 히트맵 데이터 생성
 */
export function createHeatmapData(
  studentId: string,
  studentName: string,
  rawData: RawAnswerData[]
): HeatmapData {
  const cells = aggregateToHeatmapCells(rawData);
  const rows = groupCellsIntoRows(cells);

  // 요약 통계
  let dangerCount = 0;
  let warningCount = 0;
  let goodCount = 0;
  let totalMastery = 0;

  cells.forEach((cell) => {
    switch (cell.masteryLevel) {
      case 'danger':
        dangerCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'good':
        goodCount++;
        break;
    }
    totalMastery += cell.masteryScore;
  });

  return {
    studentId,
    studentName,
    rows,
    summary: {
      totalTypes: cells.length,
      dangerCount,
      warningCount,
      goodCount,
      overallMastery: cells.length > 0 ? Math.round((totalMastery / cells.length) * 100) / 100 : 0,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Mock 데이터 생성 (개발/테스트용)
 */
export function generateMockHeatmapData(studentId: string, studentName: string): HeatmapData {
  const subjects = ['수학I', '수학II', '미적분'];
  const chapters: Record<string, string[]> = {
    '수학I': ['다항식', '방정식과 부등식', '도형의 방정식'],
    '수학II': ['함수의 극한', '미분', '적분'],
    '미적분': ['수열의 극한', '미분법', '적분법'],
  };

  const types: Record<string, string[]> = {
    '다항식': ['다항식의 연산', '항등식', '나머지정리'],
    '방정식과 부등식': ['복소수', '이차방정식', '이차함수'],
    '도형의 방정식': ['점과 좌표', '직선의 방정식', '원의 방정식'],
    '함수의 극한': ['극한값 계산', '극한의 성질', '연속함수'],
    '미분': ['미분계수', '도함수', '접선의 방정식'],
    '적분': ['부정적분', '정적분', '넓이 계산'],
    '수열의 극한': ['수열의 극한', '급수', '등비급수'],
    '미분법': ['여러 가지 미분법', '도함수의 활용', '최대최소'],
    '적분법': ['여러 가지 적분법', '정적분의 활용', '부피 계산'],
  };

  const cells: HeatmapCell[] = [];

  subjects.forEach((subject) => {
    chapters[subject].forEach((chapter) => {
      (types[chapter] || ['기본 유형']).forEach((typeName, idx) => {
        // 랜덤 통계 생성
        const totalAttempts = Math.floor(Math.random() * 20) + 3;
        const correctCount = Math.floor(Math.random() * totalAttempts * 0.6);
        const partialCorrectCount = Math.floor(Math.random() * (totalAttempts - correctCount) * 0.5);
        const partialWrongCount = Math.floor(
          Math.random() * (totalAttempts - correctCount - partialCorrectCount) * 0.5
        );
        const wrongCount = totalAttempts - correctCount - partialCorrectCount - partialWrongCount;

        const masteryScore = calculateMasteryScore(
          correctCount,
          partialCorrectCount,
          partialWrongCount,
          wrongCount
        );

        cells.push({
          id: `${studentId}-${subject}-${chapter}-${idx}`,
          typeCode: `${subject.substring(0, 2)}-${chapter.substring(0, 2)}-${String(idx + 1).padStart(3, '0')}`,
          typeName,
          chapter,
          subject,
          totalAttempts,
          correctCount,
          partialCorrectCount,
          partialWrongCount,
          wrongCount,
          masteryScore,
          masteryLevel: getMasteryLevel(masteryScore),
          avgTimeSeconds: Math.floor(Math.random() * 180) + 60,
          lastAttemptAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      });
    });
  });

  const rows = groupCellsIntoRows(cells);

  let dangerCount = 0;
  let warningCount = 0;
  let goodCount = 0;
  let totalMastery = 0;

  cells.forEach((cell) => {
    switch (cell.masteryLevel) {
      case 'danger':
        dangerCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'good':
        goodCount++;
        break;
    }
    totalMastery += cell.masteryScore;
  });

  return {
    studentId,
    studentName,
    rows,
    summary: {
      totalTypes: cells.length,
      dangerCount,
      warningCount,
      goodCount,
      overallMastery: Math.round((totalMastery / cells.length) * 100) / 100,
    },
    lastUpdated: new Date().toISOString(),
  };
}
