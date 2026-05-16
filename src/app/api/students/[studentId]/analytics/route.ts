// ============================================================================
// GET /api/students/[studentId]/analytics
//   학생 1명의 진단평가 4종 집계 — /tutor/analytics 가 호출.
//
// 응답: prescription/analytics 와 동일 스키마 (집계 대상만 학생 1명).
//   { summary, performanceTrend, errorCauses, mathsecrHeatmap, pitfalls,
//     sessions (최근 20개 — 학생 카드 list 용) }
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin — 학생 institute 격리.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
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

  const { studentId } = await params;

  // 학생 본인 + institute 격리
  const { data: student, error: stuErr } = await sb
    .from('users')
    .select('id, full_name, grade, institute_id, email')
    .eq('id', studentId)
    .maybeSingle();
  if (stuErr || !student) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
  }
  try {
    assertInstituteAccess(scope, (student as { institute_id?: string }).institute_id ?? null);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const stu = student as { id: string; full_name?: string | null; grade?: number | null; email?: string | null };
  const studentName = stu.full_name || stu.email?.split('@')[0] || '(이름 없음)';

  // print_sessions
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, exam_id, round_number, session_type, issued_at, started_at, completed_at')
    .eq('student_id', studentId)
    .order('issued_at', { ascending: false });
  const sessionList = (psRows || []) as Array<{
    id: string; exam_id: string; round_number: number; session_type: string;
    issued_at: string; started_at: string | null; completed_at: string | null;
  }>;
  const sessionIds = sessionList.map((s) => s.id);

  // session_results
  const allResults: Array<{ session_id: string; is_correct: boolean; error_cause: string | null; graded_at: string; problem_id: string }> = [];
  if (sessionIds.length > 0) {
    const { data } = await sb
      .schema('diagnostics' as never)
      .from('session_results')
      .select('session_id, is_correct, error_cause, graded_at, problem_id')
      .in('session_id', sessionIds);
    if (data) allResults.push(...(data as typeof allResults));
  }

  // exams 제목
  const examIds = Array.from(new Set(sessionList.map((s) => s.exam_id)));
  const { data: examsData } = examIds.length > 0
    ? await sb.from('exams').select('id, title').in('id', examIds)
    : { data: [] as Array<{ id: string; title: string }> };
  const examMap = new Map<string, string>();
  for (const e of (examsData || []) as Array<{ id: string; title: string }>) {
    examMap.set(e.id, e.title);
  }

  // summary
  const totalGraded = allResults.length;
  const totalCorrect = allResults.filter((r) => r.is_correct === true).length;
  const avgScorePct = totalGraded > 0 ? Math.round((totalCorrect / totalGraded) * 1000) / 10 : null;

  // performanceTrend — 세션별 정답률
  const sessionResultMap = new Map<string, { total: number; correct: number }>();
  for (const r of allResults) {
    const bucket = sessionResultMap.get(r.session_id) ?? { total: 0, correct: 0 };
    bucket.total++;
    if (r.is_correct) bucket.correct++;
    sessionResultMap.set(r.session_id, bucket);
  }
  const performanceTrend = sessionList
    .filter((s) => sessionResultMap.has(s.id))
    .map((s) => {
      const r = sessionResultMap.get(s.id)!;
      return {
        date: (s.issued_at || '').slice(0, 10),
        sessionId: s.id,
        sessionType: s.session_type,
        roundNumber: s.round_number,
        total: r.total,
        correct: r.correct,
        pct: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // errorCauses
  const errorCauses: Record<string, number> = { 개념: 0, 유형: 0, 계산: 0, 문장제: 0, 시간: 0 };
  for (const r of allResults) {
    if (r.is_correct === false && r.error_cause && errorCauses[r.error_cause] !== undefined) {
      errorCauses[r.error_cause]++;
    }
  }

  // mathsecrHeatmap (선택적)
  let mathsecrHeatmap: Array<Record<string, unknown>> = [];
  try {
    const { data: heatmap } = await sb
      .schema('diagnostics' as never)
      .from('v_student_mathsecr_heatmap' as never)
      .select('*')
      .eq('student_id', studentId)
      .limit(200);
    if (Array.isArray(heatmap)) mathsecrHeatmap = heatmap as Array<Record<string, unknown>>;
  } catch (e) {
    console.warn('[students/analytics] heatmap 조회 실패 (선택적):', (e as Error).message);
  }

  // pitfalls
  let pitfalls: Array<{ pitfall_code: string; hitCount: number; recent: string }> = [];
  try {
    const { data: histRows } = await sb
      .schema('diagnostics' as never)
      .from('student_pitfall_history')
      .select('pitfall_code, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (Array.isArray(histRows)) {
      const byCode = new Map<string, { hits: number; recent: string }>();
      for (const h of histRows as Array<{ pitfall_code: string; created_at: string }>) {
        const cur = byCode.get(h.pitfall_code) ?? { hits: 0, recent: '' };
        cur.hits++;
        if (!cur.recent || h.created_at > cur.recent) cur.recent = h.created_at;
        byCode.set(h.pitfall_code, cur);
      }
      pitfalls = Array.from(byCode.entries())
        .map(([code, v]) => ({ pitfall_code: code, hitCount: v.hits, recent: v.recent }))
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 10);
    }
  } catch (e) {
    console.warn('[students/analytics] pitfalls 집계 실패:', (e as Error).message);
  }

  // 최근 세션 목록 (학생 카드)
  const sessions = sessionList.slice(0, 20).map((s) => {
    const r = sessionResultMap.get(s.id);
    return {
      id: s.id,
      exam_id: s.exam_id,
      exam_title: examMap.get(s.exam_id) || '',
      round_number: s.round_number,
      session_type: s.session_type,
      issued_at: s.issued_at,
      completed_at: s.completed_at,
      total: r?.total ?? 0,
      correct: r?.correct ?? 0,
      pct: r && r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : null,
    };
  });

  return NextResponse.json({
    student: {
      id: stu.id,
      name: studentName,
      grade: stu.grade ?? null,
    },
    summary: {
      totalSessions: sessionList.length,
      totalGraded,
      avgScorePct,
      lastActiveAt: allResults.length > 0
        ? allResults.reduce((max, r) => (r.graded_at > max ? r.graded_at : max), '')
        : null,
    },
    performanceTrend,
    errorCauses,
    mathsecrHeatmap,
    pitfalls,
    sessions,
  });
}
