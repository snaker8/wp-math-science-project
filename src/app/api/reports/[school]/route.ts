// ============================================================================
// 학교 상세 — 시험지 리스트 + 누적 통계
// GET /api/reports/[school]
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extractSchoolName } from '@/lib/utils/school-extract';
import { extractExamYear } from '@/lib/utils/year-extract';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

export const dynamic = 'force-dynamic';

interface ExamRow {
  id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  problemCount: number;
  totalPoints: number;
  createdAt: string;
  year: number | null;
  hasAnalysis: boolean;
  hasShare: boolean;
  shareToken: string | null;
  overallDifficulty: string | null;
  unitCount: number; // 분석 결과상 단원 개수
  /** ai_analysis 풀 페이로드. 분석 미생성 시 null. 검색·인라인 펼침에서 그대로 사용 */
  analysis: ExamAIAnalysis | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ school: string }> }
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { school: rawSchool } = await params;
  const school = decodeURIComponent(rawSchool);

  // 모든 시험지 조회 후 학교명 매칭
  const { data: exams, error } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, total_points, problem_count, ai_analysis, share_token, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Fetch failed', detail: error.message }, { status: 500 });
  }

  // 학교명 매칭 (정확히 일치)
  const matched = (exams || []).filter((e) => extractSchoolName(e.title) === school);

  if (matched.length === 0) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // 시험지 row 변환
  const examRows: ExamRow[] = matched.map((e) => {
    const ai = e.ai_analysis as Record<string, unknown> | null;
    const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);
    const analysis = hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null;
    return {
      id: e.id,
      title: e.title,
      grade: e.grade,
      subject: e.subject,
      problemCount: Number(e.problem_count) || 0,
      totalPoints: Number(e.total_points) || 0,
      createdAt: e.created_at as string,
      year: extractExamYear(e.title, e.created_at as string | null),
      hasAnalysis,
      hasShare: !!e.share_token,
      shareToken: e.share_token || null,
      overallDifficulty: analysis?.overallDifficulty || null,
      unitCount: analysis?.unitAnalyses?.length || 0,
      analysis,
    };
  });

  // 누적 통계
  const totalExams = examRows.length;
  const analyzedExams = examRows.filter((e) => e.hasAnalysis).length;
  const sharedExams = examRows.filter((e) => e.hasShare).length;
  const totalProblems = examRows.reduce((s, e) => s + e.problemCount, 0);
  const totalPoints = examRows.reduce((s, e) => s + e.totalPoints, 0);

  // 학년 분포
  const gradeMap = new Map<string, number>();
  examRows.forEach((e) => {
    if (e.grade) gradeMap.set(e.grade, (gradeMap.get(e.grade) || 0) + 1);
  });
  const gradeDistribution = Array.from(gradeMap.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade.localeCompare(b.grade));

  // 분석 완료 시험지 단원 빈도 집계
  const unitFreq = new Map<string, number>();
  const overallDifficultyDist: Record<string, number> = {
    평이: 0,
    보통: 0,
    '난이도 있음': 0,
    '매우 난이도 있음': 0,
  };
  matched.forEach((e) => {
    const ai = e.ai_analysis as
      | {
          overallDifficulty?: string;
          unitAnalyses?: Array<{ majorUnit: string; questionNumbers: number[] }>;
        }
      | null
      | undefined;
    if (ai?.overallDifficulty) {
      overallDifficultyDist[ai.overallDifficulty] =
        (overallDifficultyDist[ai.overallDifficulty] || 0) + 1;
    }
    (ai?.unitAnalyses || []).forEach((u) => {
      unitFreq.set(u.majorUnit, (unitFreq.get(u.majorUnit) || 0) + (u.questionNumbers?.length || 0));
    });
  });

  const topUnits = Array.from(unitFreq.entries())
    .map(([unit, problemCount]) => ({ unit, problemCount }))
    .sort((a, b) => b.problemCount - a.problemCount)
    .slice(0, 10);

  // 등장한 발행 년도 set (내림차순)
  const yearSet = new Set<number>();
  examRows.forEach((e) => {
    if (e.year != null) yearSet.add(e.year);
  });
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  return NextResponse.json({
    school,
    summary: {
      totalExams,
      analyzedExams,
      sharedExams,
      totalProblems,
      totalPoints,
    },
    gradeDistribution,
    topUnits,
    overallDifficultyDist,
    availableYears,
    exams: examRows,
  });
}
