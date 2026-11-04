// ============================================================================
// 학교 상세 — 시험지 리스트 + 누적 통계
// GET /api/reports/[school]
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { resolveSchoolName } from '@/lib/utils/school-extract';
import { normalizeSchoolName, schoolNameVariants } from '@/lib/utils/school-normalize';
import { extractExamYear } from '@/lib/utils/year-extract';
import { extractSemester, extractExamType } from '@/lib/utils/exam-meta-extract';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

export const dynamic = 'force-dynamic';

interface ExamRow {
  id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  problemCount: number;
  totalPoints: number;
  createdAt: string | null;
  year: number | null;
  semester: 1 | 2 | null;
  examType: string | null;
  hasAnalysis: boolean;
  hasShare: boolean;
  shareToken: string | null;
  overallDifficulty: string | null;
  unitCount: number; // 분석 결과상 단원 개수
  /** ai_analysis 풀 페이로드. 분석 미생성 시 null. 검색·인라인 펼침에서 그대로 사용 */
  analysis: ExamAIAnalysis | null;
}

type ExamRec = {
  id: string; title: string; grade: string | null; subject: string | null; total_points: number | null;
  school_name: string | null; exam_year: number | null; semester: number | null; exam_round: string | null; exam_type: string | null;
  ai_analysis: unknown; share_token: string | null; created_at: string | null; exam_problems: Array<{ count: number }> | null;
};

/** PostgREST .or() 필터 값 — 쉼표·괄호가 들어가면 문법이 깨지므로 제거 */
const safeLike = (s: string) => s.replace(/[,()%]/g, '');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ school: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { school: rawSchool } = await params;
  const school = normalizeSchoolName(decodeURIComponent(rawSchool)) ?? decodeURIComponent(rawSchool);

  // ★ 2026-11-04: 학교 하나를 보는데 전체 2,474장(ai_analysis 포함)을 받던 것 → 학교명 변형들로 DB 사전 필터.
  //   정확한 판정은 아래 resolveSchoolName === school 로 다시 한다 (ilike 는 넉넉히 거르는 용도).
  const variants = schoolNameVariants(school).map(safeLike).filter(Boolean);
  const orFilter = variants.flatMap((v) => [`school_name.ilike.%${v}%`, `title.ilike.%${v}%`]).join(',');

  // ★ exams.problem_count 컬럼이 prod DB 에 없음 → exam_problems(count) 조인으로 derive
  // ★ Supabase 기본 1,000행 상한 → range 페이지네이션 (by-school 과 동일)
  const PAGE = 500;
  const exams: ExamRec[] = [];
  for (let from = 0; ; from += PAGE) {
    const baseQ = supabaseAdmin
      .from('exams')
      .select('id, title, grade, subject, total_points, school_name, exam_year, semester, exam_round, exam_type, ai_analysis, share_token, created_at, exam_problems(count)')
      .is('deleted_at', null)
      .or(orFilter);
    const { data: page, error } = await applyInstituteFilter(baseQ, scope, { allowCommonPool: true })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: 'Fetch failed', detail: error.message }, { status: 500 });
    }
    if (!page || page.length === 0) break;
    exams.push(...(page as unknown as ExamRec[]));
    if (page.length < PAGE) break;
  }

  // 학교명 매칭 — by-school 과 같은 판정(컬럼 우선 + 표기 통일)
  const matched = exams.filter((e) => e.exam_type !== '모의고사' && resolveSchoolName(e) === school);

  if (matched.length === 0) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // 시험지 row 변환 — 년도·학기·구분은 DB 컬럼 → 제목 파싱 순
  const examRows: ExamRow[] = matched.map((e) => {
    const ai = e.ai_analysis as Record<string, unknown> | null;
    const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);
    const analysis = hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null;
    const semester = (e.semester === 1 || e.semester === 2 ? e.semester : null) ?? extractSemester(e.title);
    const examType = e.exam_round || extractExamType(e.title);
    return {
      id: e.id,
      title: e.title,
      grade: e.grade,
      subject: e.subject,
      problemCount: Number(e.exam_problems?.[0]?.count) || 0,
      totalPoints: Number(e.total_points) || 0,
      createdAt: e.created_at ?? null,
      year: e.exam_year ?? extractExamYear(e.title, e.created_at),
      semester,
      examType,
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
    .sort((a, b) => a.grade.localeCompare(b.grade, 'ko'));

  // 분석 완료 시험지만 단원·난이도 집계 (★ generatedAt 없는 미완성 분석은 제외 — 위 "AI 분석 완료" 숫자와 일치)
  const unitFreq = new Map<string, number>();
  const overallDifficultyDist: Record<string, number> = {
    평이: 0,
    보통: 0,
    '난이도 있음': 0,
    '매우 난이도 있음': 0,
  };
  examRows.forEach((e) => {
    const ai = e.analysis;
    if (!ai) return;
    if (ai.overallDifficulty) {
      overallDifficultyDist[ai.overallDifficulty] = (overallDifficultyDist[ai.overallDifficulty] || 0) + 1;
    }
    (ai.unitAnalyses || []).forEach((u) => {
      // AI 가 쓴 자유 문자열 — 공백 차이("이차 함수"/"이차함수")는 같은 단원으로
      const key = String(u.majorUnit || '').replace(/\s+/g, '').trim();
      if (!key) return;
      unitFreq.set(key, (unitFreq.get(key) || 0) + (u.questionNumbers?.length || 0));
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
