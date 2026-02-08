// ============================================================================
// Analytics API Service
// 성적 분석 및 통계 데이터
// ============================================================================

import { supabaseBrowser } from '@/lib/supabase/client';

export interface StudentAnalytics {
  studentId: string;
  studentName: string;
  overallMastery: number;
  totalProblems: number;
  correctCount: number;
  wrongCount: number;
  weakTypes: string[];
  strongTypes: string[];
  recentTrend: 'up' | 'down' | 'stable';
  lastUpdated: string;
}

export interface TypeMasteryData {
  typeCode: string;
  typeName: string;
  chapter: string;
  subject: string;
  masteryRate: number;
  totalAttempts: number;
  correctAttempts: number;
  avgTimeSeconds: number;
  difficulty: number;
}

export interface HeatmapCell {
  typeCode: string;
  typeName: string;
  masteryRate: number;
  problemCount: number;
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export interface AnalyticsSummary {
  totalStudents: number;
  avgMastery: number;
  totalProblemsGraded: number;
  weakestTypes: { typeCode: string; typeName: string; masteryRate: number }[];
  strongestTypes: { typeCode: string; typeName: string; masteryRate: number }[];
  gradingTrend: { date: string; count: number }[];
}

/**
 * 학생 분석 데이터 조회
 */
export async function getStudentAnalytics(studentId: string): Promise<StudentAnalytics | null> {
  if (!supabaseBrowser) {
    throw new Error('[API] Supabase not configured');
  }

  // 학생 정보 조회
  const { data: student, error: studentError } = await supabaseBrowser
    .from('users')
    .select('id, full_name')
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    console.error('[API] getStudentAnalytics - student not found:', studentError);
    return null;
  }

  // 성적 데이터 집계 (시험 기록)
  const { data: examRecords, error: recordsError } = await supabaseBrowser
    .from('exam_records')
    .select(`
      id,
      status,
      exam_problems (
        problem_id,
        classifications (type_code)
      )
    `)
    .eq('student_id', studentId);

  if (recordsError) {
    console.error('[API] getStudentAnalytics - records error:', recordsError);
  }

  // 기본 통계 계산
  const records = examRecords || [];
  const totalProblems = records.length;
  const correctCount = records.filter(r => r.status === 'CORRECT').length;
  const wrongCount = records.filter(r => r.status === 'WRONG').length;
  const overallMastery = totalProblems > 0 ? Math.round((correctCount / totalProblems) * 100) : 0;

  // 취약/강점 유형 분석 (현재는 빈 배열)
  const weakTypes: string[] = [];
  const strongTypes: string[] = [];

  return {
    studentId: student.id,
    studentName: student.full_name,
    overallMastery,
    totalProblems,
    correctCount,
    wrongCount,
    weakTypes,
    strongTypes,
    recentTrend: 'stable',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 학생 목록 분석 데이터 조회
 */
export async function getStudentsAnalytics(options?: {
  instituteId?: string;
  classId?: string;
  limit?: number;
}): Promise<StudentAnalytics[]> {
  if (!supabaseBrowser) {
    throw new Error('[API] Supabase not configured');
  }

  // 학생 목록 조회
  let query = supabaseBrowser
    .from('users')
    .select('id')
    .eq('role', 'STUDENT')
    .is('deleted_at', null);

  if (options?.instituteId) {
    query = query.eq('institute_id', options.instituteId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data: students, error } = await query;

  if (error || !students) {
    console.error('[API] getStudentsAnalytics error:', error);
    return [];
  }

  // 각 학생의 분석 데이터 조회
  const analyticsPromises = students.map(s => getStudentAnalytics(s.id));
  const results = await Promise.all(analyticsPromises);

  return results.filter((r): r is StudentAnalytics => r !== null);
}

/**
 * 유형별 숙련도 데이터 조회
 */
export async function getTypeMasteryData(
  studentId: string,
  options?: {
    subject?: string;
    chapter?: string;
  }
): Promise<TypeMasteryData[]> {
  if (!supabaseBrowser) {
    return getMockTypeMasteryData();
  }

  // TODO: 실제 Supabase 쿼리 구현
  return getMockTypeMasteryData();
}

/**
 * 히트맵 데이터 조회
 */
export async function getHeatmapData(
  studentId: string,
  subject?: string
): Promise<HeatmapCell[][]> {
  if (!supabaseBrowser) {
    return getMockHeatmapData();
  }

  // TODO: 실제 Supabase 쿼리 구현
  return getMockHeatmapData();
}

/**
 * 반/학원 전체 분석 요약
 */
export async function getAnalyticsSummary(options?: {
  instituteId?: string;
  classId?: string;
  dateRange?: { start: string; end: string };
}): Promise<AnalyticsSummary> {
  if (!supabaseBrowser) {
    throw new Error('[API] Supabase not configured');
  }

  // 학생 수 조회
  let studentQuery = supabaseBrowser
    .from('users')
    .select('id', { count: 'exact' })
    .eq('role', 'STUDENT')
    .is('deleted_at', null);

  if (options?.instituteId) {
    studentQuery = studentQuery.eq('institute_id', options.instituteId);
  }

  const { count: totalStudents } = await studentQuery;

  // 채점된 문제 수
  const { count: totalProblemsGraded } = await supabaseBrowser
    .from('exam_records')
    .select('id', { count: 'exact' })
    .in('status', ['CORRECT', 'WRONG', 'PARTIAL_CORRECT', 'PARTIAL_WRONG']);

  return {
    totalStudents: totalStudents || 0,
    avgMastery: 75, // 향후 실제 계산 필요
    totalProblemsGraded: totalProblemsGraded || 0,
    weakestTypes: [],
    strongestTypes: [],
    gradingTrend: [],
  };
}

/**
 * 취약 유형 분석
 */
export async function getWeakTypes(
  studentId: string,
  limit = 5
): Promise<{ typeCode: string; typeName: string; masteryRate: number; suggestedAction: string }[]> {
  if (!supabaseBrowser) {
    return getMockWeakTypes();
  }

  // TODO: 실제 Supabase 쿼리 구현
  return getMockWeakTypes();
}

/**
 * 성장 추이 데이터
 */
export async function getGrowthTrend(
  studentId: string,
  period: 'week' | 'month' | '3months' = 'month'
): Promise<{ date: string; mastery: number; problemCount: number }[]> {
  if (!supabaseBrowser) {
    return getMockGrowthTrend();
  }

  // TODO: 실제 Supabase 쿼리 구현
  return getMockGrowthTrend();
}

// ============================================================================
// Mock Data
// ============================================================================

function getMockStudentAnalytics(studentId: string): StudentAnalytics {
  const students: Record<string, StudentAnalytics> = {
    '1': {
      studentId: '1',
      studentName: '김민준',
      overallMastery: 85,
      totalProblems: 120,
      correctCount: 102,
      wrongCount: 18,
      weakTypes: ['MA-CAL-LIM-02', 'MA-PRB-COMB-01'],
      strongTypes: ['MA-HS1-EQ-01', 'MA-CAL-INT-01'],
      recentTrend: 'up',
      lastUpdated: new Date().toISOString(),
    },
    '2': {
      studentId: '2',
      studentName: '이서연',
      overallMastery: 72,
      totalProblems: 95,
      correctCount: 68,
      wrongCount: 27,
      weakTypes: ['MA-HS2-FUN-03', 'MA-GEO-VEC-01'],
      strongTypes: ['MA-HS1-EQ-02', 'MA-PRB-PROB-01'],
      recentTrend: 'stable',
      lastUpdated: new Date().toISOString(),
    },
  };

  return students[studentId] || {
    studentId,
    studentName: '학생',
    overallMastery: 75,
    totalProblems: 80,
    correctCount: 60,
    wrongCount: 20,
    weakTypes: [],
    strongTypes: [],
    recentTrend: 'stable',
    lastUpdated: new Date().toISOString(),
  };
}

function getMockStudentsAnalytics(): StudentAnalytics[] {
  return [
    getMockStudentAnalytics('1'),
    getMockStudentAnalytics('2'),
    {
      studentId: '3',
      studentName: '박지호',
      overallMastery: 92,
      totalProblems: 150,
      correctCount: 138,
      wrongCount: 12,
      weakTypes: ['MA-PRB-STAT-02'],
      strongTypes: ['MA-CAL-DIF-01', 'MA-CAL-INT-02', 'MA-HS1-EQ-01'],
      recentTrend: 'up',
      lastUpdated: new Date().toISOString(),
    },
    {
      studentId: '4',
      studentName: '최수아',
      overallMastery: 65,
      totalProblems: 70,
      correctCount: 45,
      wrongCount: 25,
      weakTypes: ['MA-HS1-EQ-01', 'MA-HS1-EQ-02', 'MA-CAL-LIM-01'],
      strongTypes: ['MA-GEO-CIR-01'],
      recentTrend: 'down',
      lastUpdated: new Date().toISOString(),
    },
  ];
}

function getMockTypeMasteryData(): TypeMasteryData[] {
  return [
    { typeCode: 'MA-HS1-EQ-01', typeName: '이차방정식의 풀이', chapter: '방정식', subject: '수학I', masteryRate: 85, totalAttempts: 20, correctAttempts: 17, avgTimeSeconds: 180, difficulty: 2 },
    { typeCode: 'MA-HS1-EQ-02', typeName: '이차방정식의 근과 계수', chapter: '방정식', subject: '수학I', masteryRate: 78, totalAttempts: 15, correctAttempts: 12, avgTimeSeconds: 210, difficulty: 3 },
    { typeCode: 'MA-CAL-LIM-01', typeName: '함수의 극한', chapter: '극한', subject: '미적분', masteryRate: 70, totalAttempts: 18, correctAttempts: 13, avgTimeSeconds: 240, difficulty: 3 },
    { typeCode: 'MA-CAL-LIM-02', typeName: '극한의 계산', chapter: '극한', subject: '미적분', masteryRate: 55, totalAttempts: 12, correctAttempts: 7, avgTimeSeconds: 300, difficulty: 4 },
    { typeCode: 'MA-CAL-DIF-01', typeName: '미분계수', chapter: '미분', subject: '미적분', masteryRate: 82, totalAttempts: 25, correctAttempts: 20, avgTimeSeconds: 200, difficulty: 2 },
    { typeCode: 'MA-CAL-INT-01', typeName: '정적분', chapter: '적분', subject: '미적분', masteryRate: 90, totalAttempts: 22, correctAttempts: 20, avgTimeSeconds: 170, difficulty: 2 },
  ];
}

function getMockHeatmapData(): HeatmapCell[][] {
  const subjects = ['수학I', '수학II', '미적분', '확률과통계', '기하'];
  const chapters = ['1장', '2장', '3장', '4장', '5장'];

  return subjects.map((subject, i) =>
    chapters.map((chapter, j) => {
      const masteryRate = 40 + Math.floor(Math.random() * 60);
      let color: HeatmapCell['color'] = 'gray';
      if (masteryRate >= 71) color = 'green';
      else if (masteryRate >= 31) color = 'yellow';
      else if (masteryRate > 0) color = 'red';

      return {
        typeCode: `MA-${i}-${j}`,
        typeName: `${subject} ${chapter}`,
        masteryRate,
        problemCount: 5 + Math.floor(Math.random() * 15),
        color,
      };
    })
  );
}

function getMockAnalyticsSummary(): AnalyticsSummary {
  return {
    totalStudents: 24,
    avgMastery: 76.5,
    totalProblemsGraded: 2840,
    weakestTypes: [
      { typeCode: 'MA-CAL-LIM-02', typeName: '극한의 계산', masteryRate: 48 },
      { typeCode: 'MA-PRB-COMB-02', typeName: '조합', masteryRate: 52 },
      { typeCode: 'MA-GEO-VEC-01', typeName: '벡터의 연산', masteryRate: 55 },
    ],
    strongestTypes: [
      { typeCode: 'MA-HS1-EQ-01', typeName: '이차방정식', masteryRate: 88 },
      { typeCode: 'MA-CAL-INT-01', typeName: '정적분', masteryRate: 85 },
      { typeCode: 'MA-HS2-FUN-01', typeName: '함수의 개념', masteryRate: 82 },
    ],
    gradingTrend: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
      count: 100 + Math.floor(Math.random() * 80),
    })),
  };
}

function getMockWeakTypes() {
  return [
    { typeCode: 'MA-CAL-LIM-02', typeName: '극한의 계산', masteryRate: 48, suggestedAction: '개념 영상 학습 후 기본 문제 10문제 풀이' },
    { typeCode: 'MA-PRB-COMB-02', typeName: '조합', masteryRate: 52, suggestedAction: '경우의 수 개념 복습 및 유형별 문제 풀이' },
    { typeCode: 'MA-GEO-VEC-01', typeName: '벡터의 연산', masteryRate: 55, suggestedAction: '벡터 기본 개념 정리 및 시각화 학습' },
  ];
}

function getMockGrowthTrend() {
  return Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
    mastery: 65 + Math.floor(Math.random() * 25),
    problemCount: 3 + Math.floor(Math.random() * 8),
  }));
}
