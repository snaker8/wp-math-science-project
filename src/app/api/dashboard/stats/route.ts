// ============================================================================
// GET /api/dashboard/stats — 대시보드 통계
// ----------------------------------------------------------------------------
// 가드:
//   - requireAuthScope — 비로그인 401
//   - applyInstituteFilter — 자기 institute 만 (super_admin/ORG_ADMIN 은 산하 모두)
//   - applyTrackFilter — 활성 트랙 (flag false 시 no-op)
//
// 비고:
//   - users (학생/강사) 카운트는 institute 필터만 (트랙 무관)
//   - exams·problems 카운트는 institute + track 필터 (활성 트랙별 통계)
//   - problems 는 공통 풀 (institute_id NULL) 도 카운트
//   - exam_problems 카운트 → problems 테이블 직접 카운트로 변경 (filter 단순화)
//     → 기존 "TOTAL DB 문제 수" 와 다른 숫자일 수 있음 (exam_problems 는 문제·시험지 매핑 수,
//        problems 는 고유 문제 수). 의미상 problems 가 더 정확.
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // ── users (institute 필터만) ──
    let studentsBase = supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'STUDENT');
    const studentsQ = applyInstituteFilter(studentsBase, scope);

    let teachersBase = supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .in('role', ['TEACHER', 'ADMIN']);
    const teachersQ = applyInstituteFilter(teachersBase, scope);

    let newStudentsBase = supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'STUDENT')
      .gte('created_at', weekAgo.toISOString());
    const newStudentsQ = applyInstituteFilter(newStudentsBase, scope);

    // ── exams (institute + track 필터) ──
    let examsBase = supabaseAdmin.from('exams').select('*', { count: 'exact', head: true });
    const examsQ = applyTrackFilter(applyInstituteFilter(examsBase, scope), scope);

    let monthExamsBase = supabaseAdmin
      .from('exams')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString());
    const monthExamsQ = applyTrackFilter(applyInstituteFilter(monthExamsBase, scope), scope);

    // ── problems (institute + track 필터, 공통 풀 NULL 포함) ──
    let problemsBase = supabaseAdmin.from('problems').select('*', { count: 'exact', head: true });
    const problemsQ = applyTrackFilter(
      applyInstituteFilter(problemsBase, scope, { allowCommonPool: true }),
      scope
    );

    let newProblemsBase = supabaseAdmin
      .from('problems')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString());
    const newProblemsQ = applyTrackFilter(
      applyInstituteFilter(newProblemsBase, scope, { allowCommonPool: true }),
      scope
    );

    // 병렬 조회
    const [
      studentsResult,
      problemsResult,
      examsResult,
      teachersResult,
      newStudentsResult,
      newProblemsResult,
      monthExamsResult,
    ] = await Promise.all([
      studentsQ,
      problemsQ,
      examsQ,
      teachersQ,
      newStudentsQ,
      newProblemsQ,
      monthExamsQ,
    ]);

    // ── 월별 시험지 출제 차트 (institute + track 필터) ──
    let monthlyBase = supabaseAdmin
      .from('exams')
      .select('created_at')
      .gte('created_at', monthStart.toISOString())
      .order('created_at', { ascending: true });
    const monthlyQ = applyTrackFilter(applyInstituteFilter(monthlyBase, scope), scope);
    const { data: monthlyData } = await monthlyQ;

    const monthlyExams: { date: string; count: number }[] = [];
    if (monthlyData) {
      const dailyCounts = new Map<string, number>();
      (monthlyData as { created_at: string }[]).forEach((exam) => {
        const date = exam.created_at.split('T')[0];
        dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
      });
      dailyCounts.forEach((count, date) => monthlyExams.push({ date, count }));
    }

    return NextResponse.json({
      stats: {
        totalStudents: studentsResult.count || 0,
        totalProblems: problemsResult.count || 0,
        totalExams: examsResult.count || 0,
        totalTeachers: teachersResult.count || 0,
        averageAccuracy: 78.4,
        studentsThisWeek: newStudentsResult.count || 0,
        problemsThisWeek: newProblemsResult.count || 0,
        examsThisMonth: monthExamsResult.count || 0,
      },
      monthlyExams,
    });
  } catch (err) {
    console.error('[API/dashboard/stats] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
