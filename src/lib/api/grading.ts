// ============================================================================
// Grading API Service
// 채점 데이터 CRUD
// ============================================================================

import { supabaseBrowser } from '@/lib/supabase/client';
import type { GradingStatus } from '@/types/workflow';

export interface GradingResult {
  id: string;
  studentId: string;
  problemId: string;
  examId: string | null;
  status: GradingStatus;
  score: number;
  studentAnswer: string | null;
  feedback: string | null;
  gradedBy: string | null;
  gradedAt: string;
  createdAt: string;
}

export interface GradingSession {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  totalProblems: number;
  gradedCount: number;
  correctCount: number;
  partialCorrectCount: number;
  partialWrongCount: number;
  wrongCount: number;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * 채점 결과 저장
 */
export async function saveGradingResult(result: {
  studentId: string;
  problemId: string;
  examId?: string;
  status: GradingStatus;
  score: number;
  studentAnswer?: string;
  feedback?: string;
  gradedBy?: string;
}): Promise<GradingResult | null> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    // Return mock result for development
    return {
      id: crypto.randomUUID(),
      studentId: result.studentId,
      problemId: result.problemId,
      examId: result.examId || null,
      status: result.status,
      score: result.score,
      studentAnswer: result.studentAnswer || null,
      feedback: result.feedback || null,
      gradedBy: result.gradedBy || null,
      gradedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  // Note: grading_results 테이블이 없을 수 있으므로 실제 구현 시 테이블 생성 필요
  const { data, error } = await supabaseBrowser
    .from('grading_results')
    .upsert({
      student_id: result.studentId,
      problem_id: result.problemId,
      exam_id: result.examId || null,
      status: result.status,
      score: result.score,
      student_answer: result.studentAnswer || null,
      feedback: result.feedback || null,
      graded_by: result.gradedBy || null,
      graded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[API] saveGradingResult error:', error);
    return null;
  }

  return data ? {
    id: data.id,
    studentId: data.student_id,
    problemId: data.problem_id,
    examId: data.exam_id,
    status: data.status,
    score: data.score,
    studentAnswer: data.student_answer,
    feedback: data.feedback,
    gradedBy: data.graded_by,
    gradedAt: data.graded_at,
    createdAt: data.created_at,
  } : null;
}

/**
 * 학생별 채점 결과 조회
 */
export async function getStudentGradingResults(
  studentId: string,
  options?: {
    examId?: string;
    limit?: number;
  }
): Promise<GradingResult[]> {
  if (!supabaseBrowser) {
    return getMockGradingResults(studentId);
  }

  let query = supabaseBrowser
    .from('grading_results')
    .select('*')
    .eq('student_id', studentId);

  if (options?.examId) {
    query = query.eq('exam_id', options.examId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.order('graded_at', { ascending: false });

  if (error) {
    console.error('[API] getStudentGradingResults error:', error);
    return getMockGradingResults(studentId);
  }

  return (data || []).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    problemId: row.problem_id,
    examId: row.exam_id,
    status: row.status,
    score: row.score,
    studentAnswer: row.student_answer,
    feedback: row.feedback,
    gradedBy: row.graded_by,
    gradedAt: row.graded_at,
    createdAt: row.created_at,
  }));
}

/**
 * 채점 세션 목록 조회
 */
export async function getGradingSessions(options?: {
  status?: 'pending' | 'in_progress' | 'completed';
  limit?: number;
}): Promise<GradingSession[]> {
  // TODO: 실제 Supabase 쿼리 구현
  // 현재는 Mock 데이터 반환
  return getMockGradingSessions();
}

/**
 * 유형별 채점 통계
 */
export async function getGradingStatsByType(
  studentId: string,
  typeCode?: string
): Promise<{
  typeCode: string;
  typeName: string;
  totalCount: number;
  correctCount: number;
  wrongCount: number;
  masteryRate: number;
}[]> {
  // TODO: 실제 Supabase 쿼리 구현
  return getMockTypeStats();
}

/**
 * 일괄 채점 저장
 */
export async function saveBulkGradingResults(
  results: Array<{
    studentId: string;
    problemId: string;
    examId?: string;
    status: GradingStatus;
    score: number;
  }>
): Promise<{ success: number; failed: number }> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return { success: results.length, failed: 0 };
  }

  const insertData = results.map((r) => ({
    student_id: r.studentId,
    problem_id: r.problemId,
    exam_id: r.examId || null,
    status: r.status,
    score: r.score,
    graded_at: new Date().toISOString(),
  }));

  const { error } = await supabaseBrowser
    .from('grading_results')
    .upsert(insertData);

  if (error) {
    console.error('[API] saveBulkGradingResults error:', error);
    return { success: 0, failed: results.length };
  }

  return { success: results.length, failed: 0 };
}

// ============================================================================
// Mock Data
// ============================================================================

function getMockGradingResults(studentId: string): GradingResult[] {
  const statuses: GradingStatus[] = ['CORRECT', 'PARTIAL_CORRECT', 'PARTIAL_WRONG', 'WRONG'];
  const scores = [100, 70, 30, 0];

  return Array.from({ length: 20 }, (_, i) => {
    const statusIndex = i % 4;
    return {
      id: `gr-${studentId}-${i}`,
      studentId,
      problemId: `p-${i + 1}`,
      examId: 'exam-1',
      status: statuses[statusIndex],
      score: scores[statusIndex],
      studentAnswer: null,
      feedback: null,
      gradedBy: 'teacher-1',
      gradedAt: new Date(Date.now() - i * 86400000).toISOString(),
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    };
  });
}

function getMockGradingSessions(): GradingSession[] {
  return [
    {
      id: 'gs-1',
      examId: 'exam-1',
      studentId: '1',
      studentName: '김민준',
      totalProblems: 20,
      gradedCount: 20,
      correctCount: 14,
      partialCorrectCount: 3,
      partialWrongCount: 2,
      wrongCount: 1,
      progress: 100,
      status: 'completed',
    },
    {
      id: 'gs-2',
      examId: 'exam-1',
      studentId: '2',
      studentName: '이서연',
      totalProblems: 20,
      gradedCount: 15,
      correctCount: 10,
      partialCorrectCount: 3,
      partialWrongCount: 1,
      wrongCount: 1,
      progress: 75,
      status: 'in_progress',
    },
    {
      id: 'gs-3',
      examId: 'exam-1',
      studentId: '3',
      studentName: '박지호',
      totalProblems: 20,
      gradedCount: 0,
      correctCount: 0,
      partialCorrectCount: 0,
      partialWrongCount: 0,
      wrongCount: 0,
      progress: 0,
      status: 'pending',
    },
  ];
}

function getMockTypeStats() {
  return [
    { typeCode: 'MA-HS1-EQ-01', typeName: '이차방정식', totalCount: 15, correctCount: 12, wrongCount: 3, masteryRate: 80 },
    { typeCode: 'MA-CAL-LIM-02', typeName: '극한', totalCount: 10, correctCount: 6, wrongCount: 4, masteryRate: 60 },
    { typeCode: 'MA-CAL-INT-01', typeName: '정적분', totalCount: 8, correctCount: 7, wrongCount: 1, masteryRate: 87.5 },
    { typeCode: 'MA-HS2-FUN-03', typeName: '함수의 그래프', totalCount: 12, correctCount: 9, wrongCount: 3, masteryRate: 75 },
  ];
}
