// ============================================================================
// GET /api/diagnostics/analytics
//   진단평가 학원 전체 분석 — /dashboard/prescription/analytics 가 사용.
//
// 집계:
//   - summary: 학생수·세션수·평균 정답률·최근 활동
//   - performanceTrend: 일자별 평균 정답률 추이 (최근 90일)
//   - errorCauses: 오답 원인 5종 별 건수 (개념·유형·계산·문장제·시간)
//   - mathsecrHeatmap: 학생 × 대단원(level1) 정답률 행렬 (v_student_mathsecr_heatmap)
//   - pitfalls: 함정 누적 top N (student_pitfall_history 집계)
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin — institute 격리.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 1) institute 격리 — 학생 id 목록 결정
  let studentQuery = sb.from('users').select('id, full_name, grade, institute_id').eq('role', 'STUDENT');
  if (!scope.isSuperAdmin) {
    const accessibleIds = scope.accessibleInstituteIds || [];
    if (accessibleIds.length === 0) {
      return NextResponse.json({
        summary: { totalStudents: 0, totalSessions: 0, avgScorePct: null, recentlyActive: 0 },
        performanceTrend: [],
        errorCauses: { 개념: 0, 유형: 0, 계산: 0, 문장제: 0, 시간: 0 },
        mathsecrHeatmap: [],
        pitfalls: [],
      });
    }
    studentQuery = studentQuery.in('institute_id', accessibleIds);
  }
  const { data: students, error: stuErr } = await studentQuery;
  if (stuErr) {
    return NextResponse.json({ error: `students 조회 실패: ${stuErr.message}` }, { status: 500 });
  }
  const studentList = (students || []) as Array<{ id: string; full_name?: string | null; grade?: number | null }>;
  const studentIds = studentList.map((s) => s.id);
  const studentMap = new Map<string, { name: string; grade: number | null }>();
  for (const s of studentList) {
    studentMap.set(s.id, { name: s.full_name || '(이름 없음)', grade: s.grade ?? null });
  }

  if (studentIds.length === 0) {
    return NextResponse.json({
      summary: { totalStudents: 0, totalSessions: 0, avgScorePct: null, recentlyActive: 0 },
      performanceTrend: [],
      errorCauses: { 개념: 0, 유형: 0, 계산: 0, 문장제: 0, 시간: 0 },
      mathsecrHeatmap: [],
      pitfalls: [],
    });
  }

  // 2) print_sessions — 본 학원 학생 세션
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at, issued_at')
    .in('student_id', studentIds);
  const sessionList = (psRows || []) as Array<{ id: string; student_id: string; completed_at: string | null; issued_at: string }>;
  const sessionIds = sessionList.map((s) => s.id);

  // 3) session_results — 채점 결과 일괄 조회 (페이지네이션 — 1000 limit 회피)
  const allResults: Array<{ session_id: string; is_correct: boolean; error_cause: string | null; graded_at: string; problem_id: string }> = [];
  if (sessionIds.length > 0) {
    const PAGE = 500;
    for (let i = 0; i < sessionIds.length; i += PAGE) {
      const slice = sessionIds.slice(i, i + PAGE);
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, error_cause, graded_at, problem_id')
        .in('session_id', slice);
      if (data) allResults.push(...(data as typeof allResults));
    }
  }

  // 4) summary 집계
  const totalSessions = sessionList.length;
  const totalGraded = allResults.length;
  const totalCorrect = allResults.filter((r) => r.is_correct === true).length;
  const avgScorePct = totalGraded > 0 ? Math.round((totalCorrect / totalGraded) * 1000) / 10 : null;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeStudentIds = new Set<string>();
  for (const r of allResults) {
    if (new Date(r.graded_at).getTime() >= sevenDaysAgo) {
      const sess = sessionList.find((s) => s.id === r.session_id);
      if (sess) activeStudentIds.add(sess.student_id);
    }
  }

  // 5) performanceTrend — 일자별 정답률 (graded_at 기준)
  const byDate = new Map<string, { total: number; correct: number }>();
  for (const r of allResults) {
    const day = (r.graded_at || '').slice(0, 10);
    if (!day) continue;
    const bucket = byDate.get(day) ?? { total: 0, correct: 0 };
    bucket.total++;
    if (r.is_correct) bucket.correct++;
    byDate.set(day, bucket);
  }
  const performanceTrend = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-90)
    .map(([date, { total, correct }]) => ({
      date,
      total,
      correct,
      pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    }));

  // 6) errorCauses — 오답 원인 분포
  const errorCauses: Record<string, number> = { 개념: 0, 유형: 0, 계산: 0, 문장제: 0, 시간: 0 };
  for (const r of allResults) {
    if (r.is_correct === false && r.error_cause && errorCauses[r.error_cause] !== undefined) {
      errorCauses[r.error_cause]++;
    }
  }

  // 7) mathsecrHeatmap — v_student_mathsecr_heatmap 뷰 활용 (있으면)
  let mathsecrHeatmap: Array<Record<string, unknown>> = [];
  try {
    const { data: heatmap } = await sb
      .schema('diagnostics' as never)
      .from('v_student_mathsecr_heatmap' as never)
      .select('*')
      .in('student_id', studentIds)
      .limit(500);
    if (Array.isArray(heatmap)) mathsecrHeatmap = heatmap as Array<Record<string, unknown>>;
  } catch (e) {
    console.warn('[diagnostics/analytics] heatmap 뷰 조회 실패 (선택적):', (e as Error).message);
  }

  // 8) pitfalls — student_pitfall_history 집계 (top 10)
  let pitfalls: Array<{ pitfall_code: string; hitCount: number; affectedStudents: number; recent: string }> = [];
  try {
    const { data: histRows } = await sb
      .schema('diagnostics' as never)
      .from('student_pitfall_history')
      .select('student_id, pitfall_code, created_at')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (Array.isArray(histRows)) {
      const byCode = new Map<string, { hits: number; students: Set<string>; recent: string }>();
      for (const h of histRows as Array<{ student_id: string; pitfall_code: string; created_at: string }>) {
        const cur = byCode.get(h.pitfall_code) ?? { hits: 0, students: new Set<string>(), recent: '' };
        cur.hits++;
        cur.students.add(h.student_id);
        if (!cur.recent || h.created_at > cur.recent) cur.recent = h.created_at;
        byCode.set(h.pitfall_code, cur);
      }
      pitfalls = Array.from(byCode.entries())
        .map(([code, v]) => ({
          pitfall_code: code,
          hitCount: v.hits,
          affectedStudents: v.students.size,
          recent: v.recent,
        }))
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 10);
    }
  } catch (e) {
    console.warn('[diagnostics/analytics] pitfalls 집계 실패 (선택적):', (e as Error).message);
  }

  return NextResponse.json({
    summary: {
      totalStudents: studentIds.length,
      totalSessions,
      totalGraded,
      avgScorePct,
      recentlyActive: activeStudentIds.size,
    },
    performanceTrend,
    errorCauses,
    mathsecrHeatmap,
    pitfalls,
  });
}
