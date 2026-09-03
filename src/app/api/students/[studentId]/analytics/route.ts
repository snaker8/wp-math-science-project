// ============================================================================
// GET /api/students/[studentId]/analytics
//   학생 1명의 진단평가 4종 집계 — /tutor/analytics 가 호출.
//
// 응답: prescription/analytics 와 동일 스키마 (집계 대상만 학생 1명).
//   { student, summary, performanceTrend, errorCauses, mathsecrHeatmap, pitfalls,
//     sessions (최근 20개 — 학생 카드 list 용), source: 'user' | 'roster' }
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin — 학생 institute 격리.
//
// 데이터 소스 두 갈래 (2026-05-29 통합):
//   - users.id     → diagnostics.print_sessions + session_results (QR/인쇄 라인)
//   - roster_students.id → diagnostics.sessions + items (엑셀 일괄 채점 라인)
//
//   동일 응답 스키마로 정규화 — 호출자(/tutor/analytics)는 source 만 구분.
//   roster 측은 mathsecrHeatmap / pitfalls 미지원 → 빈 배열 반환.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveStudentIdentity } from '@/lib/diagnostics/find-session';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface NormalizedSession {
  id: string;
  exam_id: string;
  session_type: string;
  round_number: number;
  date_iso: string;          // 발급/실시 시각 (정렬용)
  completed_at: string | null;
  // EX(시험 채점) 세션의 리포트 링크용 diagnostics student_id(= roster id).
  // print_sessions(QR/인쇄)에는 없음(undefined).
  student_ref?: string;
}

interface NormalizedResult {
  session_id: string;
  is_correct: boolean;
  error_cause: string | null;
  occurred_at: string;        // graded_at(print) 또는 conducted_at(roster) — 최근 활동 계산용
}

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

  // 학생 소스 자동 감지: users 먼저, 없으면 roster_students
  let source: 'user' | 'roster' = 'user';
  let studentName = '';
  let studentGrade: number | null = null;
  let studentInstituteId: string | null = null;

  const { data: userStudent } = await sb
    .from('users')
    .select('id, full_name, grade, institute_id, email')
    .eq('id', studentId)
    .maybeSingle();

  if (userStudent) {
    const u = userStudent as {
      id: string; full_name?: string | null; grade?: number | null;
      institute_id?: string | null; email?: string | null;
    };
    studentName = u.full_name || u.email?.split('@')[0] || '(이름 없음)';
    studentGrade = u.grade ?? null;
    studentInstituteId = u.institute_id ?? null;
  } else {
    const { data: rosterStudent } = await sb
      .from('roster_students')
      .select('id, full_name, grade, institute_id')
      .eq('id', studentId)
      .maybeSingle();
    if (!rosterStudent) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
    }
    source = 'roster';
    const r = rosterStudent as {
      id: string; full_name?: string | null; grade?: number | null;
      institute_id?: string | null;
    };
    studentName = r.full_name || '(이름 없음)';
    studentGrade = r.grade ?? null;
    studentInstituteId = r.institute_id ?? null;
  }

  try {
    assertInstituteAccess(scope, studentInstituteId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // 세션 + 결과 정규화
  const sessionList: NormalizedSession[] = [];
  const allResults: NormalizedResult[] = [];

  // ★ 2026-09-02 — B(채점) 라인 단일. 옛 코드는 두 갈래였다:
  //   · 정식 학생(user): B 는 user id 로만, 연결된 명단(roster)은 A(sessions/items)로
  //   · 명단 학생(roster): A 만
  //   그래서 QR 로 채점한 기록이 통째로 빠졌다(실측: 세션 206개 중 96개가 B 에만 있다).
  //   A 의 기록은 마이그레이션으로 B 에 들어와 있으므로, **신원(user+roster)을 합쳐 B 만**
  //   읽으면 전부 나온다. 둘 다 읽으면 같은 문항을 두 번 세게 된다.
  const identityIds = await resolveStudentIdentity(sb, studentId);

  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, exam_id, student_id, round_number, session_type, issued_at, completed_at')
    .in('student_id', identityIds)
    .order('issued_at', { ascending: false });

  for (const s of (psRows || []) as Array<{
    id: string; exam_id: string; student_id: string; round_number: number;
    session_type: string; issued_at: string; completed_at: string | null;
  }>) {
    sessionList.push({
      id: s.id,
      exam_id: s.exam_id,
      session_type: s.session_type,
      round_number: s.round_number,
      date_iso: s.issued_at,
      completed_at: s.completed_at,
      // 리포트 링크는 **세션에 실제로 박힌 id** 로 걸어야 한다 (승격 전 roster id 일 수 있다)
      student_ref: s.student_id,
    });
  }

  const sessionIds = sessionList.map((s) => s.id);
  if (sessionIds.length > 0) {
    // ★ 1,000 행에서 잘린다 — 학생 한 명이라도 시험이 쌓이면 걸린다.
    const rows: Array<{ session_id: string; is_correct: boolean; error_cause: string | null;
                        graded_at: string | null; teacher_note: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, error_cause, graded_at, teacher_note')
        .in('session_id', sessionIds)
        .order('id')
        .range(from, from + 999);
      const batch = (data || []) as typeof rows;
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    const dateMap = new Map<string, string>();
    for (const s of sessionList) dateMap.set(s.id, s.date_iso);
    for (const r of rows) {
      if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;
      allResults.push({
        session_id: r.session_id,
        is_correct: r.is_correct,
        error_cause: r.error_cause,
        occurred_at: r.graded_at ?? dateMap.get(r.session_id) ?? '',
      });
    }
  }

  // exams 제목 (exam_id 빈 문자열 제외)
  const examIds = Array.from(
    new Set(sessionList.map((s) => s.exam_id).filter((id) => !!id))
  );
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
        date: (s.date_iso || '').slice(0, 10),
        sessionId: s.id,
        sessionType: s.session_type,
        roundNumber: s.round_number,
        total: r.total,
        correct: r.correct,
        pct: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // errorCauses + 미분류 카운트
  //   강사가 X 만 누르고 오답 원인 칩을 안 골랐으면 error_cause = NULL.
  //   분포 차트에 안 잡혀 "총 0건" 표시 사고 원인 (2026-05-16, 사용자 보고).
  //   → totalWrong / uncategorizedWrong 도 응답에 노출해서 강사에게 분류 입력 유도.
  const errorCauses: Record<string, number> = { 개념: 0, 유형: 0, 계산: 0, 문장제: 0, 시간: 0 };
  let totalWrong = 0;
  let uncategorizedWrong = 0;
  for (const r of allResults) {
    if (r.is_correct !== false) continue;
    totalWrong++;
    if (r.error_cause && errorCauses[r.error_cause] !== undefined) {
      errorCauses[r.error_cause]++;
    } else {
      uncategorizedWrong++;
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

  // 최근 세션 목록 (학생 카드) — print + EX 합쳐 최신순 20개
  const sessions = [...sessionList]
    .sort((a, b) => (b.date_iso || '').localeCompare(a.date_iso || ''))
    .slice(0, 20)
    .map((s) => {
      const r = sessionResultMap.get(s.id);
      return {
        id: s.id,
        exam_id: s.exam_id,
        exam_title: examMap.get(s.exam_id) || '',
        round_number: s.round_number,
        session_type: s.session_type,
        issued_at: s.date_iso,
        completed_at: s.completed_at,
        total: r?.total ?? 0,
        correct: r?.correct ?? 0,
        pct: r && r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : null,
        // EX(시험 채점) 세션이면 학생 리포트로 직접 갈 roster id (그 외 null)
        report_student_id: s.student_ref ?? null,
      };
    });

  return NextResponse.json({
    student: {
      id: studentId,
      name: studentName,
      grade: studentGrade,
    },
    source,
    summary: {
      totalSessions: sessionList.length,
      totalGraded,
      totalWrong,
      uncategorizedWrong,
      avgScorePct,
      lastActiveAt: allResults.length > 0
        ? allResults.reduce((max, r) => (r.occurred_at > max ? r.occurred_at : max), '')
        : null,
    },
    performanceTrend,
    errorCauses,
    mathsecrHeatmap,
    pitfalls,
    sessions,
  });
}
