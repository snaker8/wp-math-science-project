// ============================================================================
// GET /api/grades/roster
//   "학생 성적" 페이지 일람표 — 학원 내 전체 학생 × 점수 4소스 집계.
//
//   소스:
//     내신   : student_school_exam_scores (최근 1건 — 학년·학기·구분 기준)
//     모의고사: student_exam_scores (최근 1건 — exam_date 기준)
//     진단   : diagnostics.sessions(BS/DD/PT/SC)+items / print_sessions+session_results
//              → 전체 평균 정답률
//     EX     : diagnostics.sessions(EX)+items / print_sessions(EX)+session_results
//              → 최근 1회 정답률
//
//   ※ Phase 1: 진단/EX 집계는 student_id = users.id 직접 매칭.
//      promoted roster(roster_students.promoted_user_id) 병합은 Phase 1b 보강 대상
//      (compute-report / exam-sets 와 동일 병합 규칙 적용 예정).
//
//   권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin. 멀티테넌시 가드 #8.
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DIAG_TYPES = new Set(['BS', 'DD', 'PT', 'SC']);
const TERM_RANK: Record<string, number> = { 중간: 0, 기말: 1 };

interface ProgressAgg { correct: number; total: number; latestAt: string | null; latestPct: number | null; }

function pct(correct: number, total: number): number | null {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

export async function GET() {
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

  // 1) 학생(users) 목록 — 활성 센터(자사관) 선택 시 그 센터 학생만 (super_admin 포함).
  //   /api/users/students 와 동일 규칙: activeInstituteId 있으면 핀, 없으면 scope 기본 필터.
  //   (super_admin 이라도 센터 선택돼 있으면 전 학원 섞임 차단. 다른 학원은 센터 전환으로.)
  const activeInstituteId = resolveActiveInstitute(scope);
  const studentsQuery = sb
    .from('users')
    .select('id, full_name, email, grade')
    .eq('role', 'STUDENT')
    .is('deleted_at', null);
  const { data: stuRows, error: stuErr } = activeInstituteId
    ? await studentsQuery.eq('institute_id', activeInstituteId)
    : await applyInstituteFilter(studentsQuery, scope);
  if (stuErr) {
    return NextResponse.json({ error: stuErr.message }, { status: 500 });
  }
  const students = (stuRows ?? []) as Array<{
    id: string; full_name: string | null; email: string | null;
    grade: number | null;
  }>;
  if (students.length === 0) {
    return NextResponse.json({ students: [] });
  }
  const ids = students.map((s) => s.id);

  // 2) 내신 — 최근 1건 (grade desc, semester desc, term 기말>중간)
  const schoolLatest = new Map<string, { score: number; grade: number; semester: number; term: string }>();
  {
    const { data } = await sb
      .from('student_school_exam_scores')
      .select('student_id, subject, grade, semester, term, score')
      .in('student_id', ids);
    for (const r of (data ?? []) as Array<{ student_id: string; grade: number; semester: number; term: string; score: number }>) {
      const cur = schoolLatest.get(r.student_id);
      const better = !cur
        || r.grade > cur.grade
        || (r.grade === cur.grade && r.semester > cur.semester)
        || (r.grade === cur.grade && r.semester === cur.semester && (TERM_RANK[r.term] ?? 0) > (TERM_RANK[cur.term] ?? 0));
      if (better) schoolLatest.set(r.student_id, { score: Number(r.score), grade: r.grade, semester: r.semester, term: r.term });
    }
  }

  // 3) 모의고사 — 최근 1건 (exam_date desc, null 은 뒤)
  const mockLatest = new Map<string, { score: number; examType: string; examDate: string | null }>();
  {
    const { data } = await sb
      .from('student_exam_scores')
      .select('student_id, exam_type, score, exam_date')
      .in('student_id', ids);
    for (const r of (data ?? []) as Array<{ student_id: string; exam_type: string; score: number; exam_date: string | null }>) {
      const cur = mockLatest.get(r.student_id);
      const curD = cur?.examDate ?? '';
      const rD = r.exam_date ?? '';
      if (!cur || rD > curD) mockLatest.set(r.student_id, { score: Number(r.score), examType: r.exam_type, examDate: r.exam_date });
    }
  }

  // 4-pre) promoted roster 확장 — 엑셀 채점 세션은 roster id 로 키됨.
  //   roster_students.promoted_user_id = users.id 로 연결된 roster 의 세션도 그 정식 user 성적에
  //   합류해야 함(직접 user.id 매칭만 하면 promoted 학생 진단/EX 가 통째로 누락). analytics 와 동일.
  const rosterToUser = new Map<string, string>();
  {
    const { data: prRows } = await sb
      .from('roster_students')
      .select('id, promoted_user_id')
      .in('promoted_user_id', ids);
    for (const r of (prRows ?? []) as Array<{ id: string; promoted_user_id: string }>) {
      if (r.promoted_user_id) rosterToUser.set(r.id, r.promoted_user_id);
    }
  }
  const queryIds = ids.concat(Array.from(rosterToUser.keys())); // 세션 조회용 확장 id
  const canonId = (sid: string): string => rosterToUser.get(sid) ?? sid; // roster id → 정식 user id

  // 4) 진단 / EX — diagnostics.sessions + items
  const diagAgg = new Map<string, ProgressAgg>();
  const exAgg = new Map<string, ProgressAgg>();
  const ensure = (m: Map<string, ProgressAgg>, id: string): ProgressAgg => {
    let a = m.get(id);
    if (!a) { a = { correct: 0, total: 0, latestAt: null, latestPct: null }; m.set(id, a); }
    return a;
  };

  // 4a) A라인(sessions+items) 읽기는 제거했다 (2026-09-02).
  //   A 를 B 로 이관한 뒤로 두 라인을 **더하고 있어** 같은 채점이 두 번 세어졌다 —
  //   진단 평균 정답률이 부풀고, 최근 EX 정답률도 A/B 중 아무거나 잡히는 상태였다.
  //   A 는 이미 B 안에 있으므로 아래 4b 하나만 읽는다.

  // 4b) QR/인쇄 채점 — print_sessions + session_results
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, session_type, completed_at, issued_at')
    .in('student_id', queryIds);
  const printSessions = (psRows ?? []) as Array<{ id: string; student_id: string; session_type: string; completed_at: string | null; issued_at: string | null }>;
  const psById = new Map(printSessions.map((p) => [p.id, p]));
  if (printSessions.length > 0) {
    const psIds = printSessions.map((p) => p.id);
    const perSession = new Map<string, { correct: number; total: number }>();
    // ★ 세션을 500개씩 끊어도 **행 수**는 서버가 1,000에서 자른다.
    //   세션 96개 × 25문항 ≈ 2,400행인데 1,000행만 와서 **뒤쪽 학생 성적이 통째로 빈 값**이었다
    //   (실측 2026-09-02: 결과가 잡힌 세션 39/96 — 39×25≈1,000). 원래부터 있던 버그.
    //   세션 묶음 안에서도 range 로 끝까지 받아야 한다.
    for (let i = 0; i < psIds.length; i += 200) {
      const chunk = psIds.slice(i, i + 200);
      for (let from = 0; ; from += 1000) {
        const { data: srRows } = await sb
          .schema('diagnostics' as never)
          .from('session_results')
          .select('session_id, is_correct, teacher_note')
          .in('session_id', chunk)
          .order('id')
          .range(from, from + 999);
        const rows = (srRows ?? []) as Array<{ session_id: string; is_correct: boolean; teacher_note: string | null }>;
        for (const sr of rows) {
          if ((sr.teacher_note ?? '').includes('자동채점 보류')) continue; // 보류 제외
          const p = perSession.get(sr.session_id) ?? { correct: 0, total: 0 };
          p.total += 1; if (sr.is_correct) p.correct += 1;
          perSession.set(sr.session_id, p);
        }
        if (rows.length < 1000) break;
      }
    }
    for (const [sid, p] of perSession) {
      const ps = psById.get(sid); if (!ps) continue;
      const isDiag = DIAG_TYPES.has(ps.session_type);
      const m = isDiag ? diagAgg : exAgg;
      const a = ensure(m, canonId(ps.student_id));
      a.correct += p.correct; a.total += p.total;
      const when = ps.completed_at ?? ps.issued_at ?? null;
      if (!isDiag && when && (!a.latestAt || when > a.latestAt)) { a.latestAt = when; a.latestPct = pct(p.correct, p.total); }
    }
  }

  // 5) 조립
  const payload = students.map((s) => {
    const school = schoolLatest.get(s.id) ?? null;
    const mock = mockLatest.get(s.id) ?? null;
    const diag = diagAgg.get(s.id) ?? null;
    const ex = exAgg.get(s.id) ?? null;
    return {
      id: s.id,
      name: s.full_name || s.email?.split('@')[0] || '(이름 없음)',
      grade: s.grade ?? null,
      school: school ? { score: school.score, grade: school.grade, semester: school.semester, term: school.term } : null,
      mock: mock ? { score: mock.score, examType: mock.examType, examDate: mock.examDate } : null,
      diagPct: diag ? pct(diag.correct, diag.total) : null,
      exLatestPct: ex ? ex.latestPct : null,
    };
  });
  // 학년 desc → 이름 asc (학년별 그룹은 클라에서)
  payload.sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1) || a.name.localeCompare(b.name, 'ko'));

  return NextResponse.json({ students: payload });
}
