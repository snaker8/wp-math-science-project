// ============================================================================
// POST /api/sessions
//   학생 N명 × 특정 시험지 × 회차 = N개 QR 채점 세션 일괄 생성.
//   각 학생별로 print_sessions 1행 + session_problems 문항수 행 스냅샷 기록.
//
// body:
//   {
//     exam_id: string (uuid),
//     student_ids: string[] (uuid 배열),
//     round_number?: number (기본 1),
//     session_type?: 'BS' | 'DD' | 'PT' | 'SC' (기본 'BS'),
//     teacher_note?: string
//   }
//
// 동작:
//   1. exam + exam_problems + classifications 조회 (1회)
//   2. 각 student_id 에 대해 print_sessions 행 + session_problems 문항별 스냅샷 INSERT
//   3. 이미 같은 (student, exam, round) 세션이 있으면 건너뜀 (UNIQUE 제약)
//
// 반환:
//   { created: [{ session_id, student_id, problem_count }], skipped: [{ student_id, reason }] }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// GET /api/sessions
//   채점하기 페이지 — 세션 목록 조회 (institute 격리).
//
// 쿼리:
//   ?student_id  특정 학생 한정
//   ?exam_id     특정 시험지 한정
//   ?status      'pending'(미완료) | 'done'(완료) | 미지정(전체)
//   ?limit       기본 50, 최대 200
//
// 응답:
//   { sessions: [{ id, student_id, student_name, exam_id, exam_title,
//                  round_number, session_type, issued_at, started_at, completed_at,
//                  problems_total, problems_graded, correct_cnt, score_pct }] }
//
// institute 격리:
//   print_sessions 에 institute_id 컬럼이 없으므로, 같은 institute 의 users 와
//   exams 만 매칭되는 세션으로 한정한다. (exam_id ∈ institute_exams) 또는
//   (student_id ∈ institute_users).
// ============================================================================
export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const sp = request.nextUrl.searchParams;
  const filterStudentId = sp.get('student_id') || undefined;
  const filterExamId = sp.get('exam_id') || undefined;
  const status = sp.get('status') || undefined;
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50') || 50, 1), 200);

  // 세션 본체 — print_sessions 테이블 직접 조회 (v_print_session_summary 뷰는
  // PostgREST 에 자동 노출되지 않아 'Invalid schema' 에러가 남. 대신 아래에서
  // session_problems / session_results 를 batch in() 으로 받아 집계).
  let query = sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, round_number, session_type, issued_at, started_at, completed_at, teacher_note')
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (filterStudentId) query = query.eq('student_id', filterStudentId);
  if (filterExamId) query = query.eq('exam_id', filterExamId);
  if (status === 'pending') query = query.is('completed_at', null);
  if (status === 'done') query = query.not('completed_at', 'is', null);

  // 활성 센터 필터 — 활성 institute 의 학생 세션만 노출
  const activeInstituteId = resolveActiveInstitute(scope);
  if (activeInstituteId) {
    const { data: instUsers } = await sb
      .from('users')
      .select('id')
      .eq('institute_id', activeInstituteId);
    const userIds = ((instUsers ?? []) as { id: string }[]).map((u) => u.id);
    if (userIds.length === 0) {
      return NextResponse.json({ sessions: [] });
    }
    query = query.in('student_id', userIds);
  }

  const { data: psRows, error: psErr } = await query;
  if (psErr) {
    console.error('[api/sessions GET] print_sessions error:', psErr.message);
    return NextResponse.json({ error: psErr.message }, { status: 500 });
  }

  const sessionIds = ((psRows || []) as Array<{ id: string }>).map(r => r.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  // 집계 — session_problems 행 수(=problems_total), session_results 행 수(=problems_graded) + correct 수
  const [{ data: spRows }, { data: srRows }] = await Promise.all([
    sb.schema('diagnostics' as never)
      .from('session_problems')
      .select('session_id')
      .in('session_id', sessionIds),
    sb.schema('diagnostics' as never)
      .from('session_results')
      .select('session_id, is_correct')
      .in('session_id', sessionIds),
  ]);

  const totalsBySession = new Map<string, number>();
  for (const r of (spRows || []) as Array<{ session_id: string }>) {
    totalsBySession.set(r.session_id, (totalsBySession.get(r.session_id) || 0) + 1);
  }
  const gradedBySession = new Map<string, number>();
  const correctBySession = new Map<string, number>();
  for (const r of (srRows || []) as Array<{ session_id: string; is_correct: boolean }>) {
    gradedBySession.set(r.session_id, (gradedBySession.get(r.session_id) || 0) + 1);
    if (r.is_correct) correctBySession.set(r.session_id, (correctBySession.get(r.session_id) || 0) + 1);
  }

  const rows: Array<Record<string, unknown>> = ((psRows || []) as Array<Record<string, unknown>>).map(r => {
    const sid = r.id as string;
    const total = totalsBySession.get(sid) || 0;
    const graded = gradedBySession.get(sid) || 0;
    const correct = correctBySession.get(sid) || 0;
    return {
      session_id: sid,
      student_id: r.student_id,
      exam_id: r.exam_id,
      round_number: r.round_number,
      session_type: r.session_type,
      issued_at: r.issued_at,
      started_at: r.started_at,
      completed_at: r.completed_at,
      problems_total: total,
      problems_graded: graded,
      correct_cnt: correct,
      score_pct: graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null,
    };
  });
  if (rows.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  // institute 격리 — student/exam 쪽에서 가져와 같은 institute 만 통과시킴.
  // super_admin 은 통과. ORG_ADMIN/user 는 자기 institute_ids 만.
  const studentIds = Array.from(new Set(rows.map(r => r.student_id as string).filter(Boolean)));
  const examIds = Array.from(new Set(rows.map(r => r.exam_id as string).filter(Boolean)));

  const [{ data: usersData }, { data: examsData }] = await Promise.all([
    studentIds.length
      ? sb.from('users').select('id, full_name, email, grade, institute_id').in('id', studentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name?: string; email?: string; grade?: number; institute_id?: string }> }),
    examIds.length
      ? sb.from('exams').select('id, title, institute_id').in('id', examIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title?: string; institute_id?: string }> }),
  ]);

  // ★ 이름 backfill — public.users.full_name 비면 auth.users 의
  //   raw_user_meta_data.full_name 에서 가져와 박음 (signup·createUser 시점에
  //   동봉됐던 진짜 이름). 부수적 update — fire-and-forget.
  //   ★ users.name 컬럼은 존재하지 않음 — full_name 만 사용 (사용자 보고
  //   "column users.name does not exist", 2026-05-16).
  const userList = (usersData || []) as Array<{
    id: string; full_name?: string; email?: string; grade?: number; institute_id?: string;
  }>;
  const missingNameIds = userList
    .filter((u) => !u.full_name)
    .map((u) => u.id);
  const authNameMap = new Map<string, string>();
  if (missingNameIds.length > 0) {
    // auth.admin.getUserById 는 1명씩 호출 — 학생 수십명 한도면 무관.
    //   첫 호출 후 backfill UPDATE 되므로 다음 호출엔 missingNameIds 가 빔.
    await Promise.all(
      missingNameIds.map(async (uid) => {
        try {
          const { data: authUser } = await sb.auth.admin.getUserById(uid);
          const meta = (authUser?.user?.user_metadata || {}) as Record<string, unknown>;
          const metaName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
          if (metaName) {
            authNameMap.set(uid, metaName);
            // public.users 영구 박음 — 다음 호출부터는 admin API 호출 없이 즉시 표시.
            void sb.from('users').update({ full_name: metaName }).eq('id', uid);
          }
        } catch (e) {
          console.warn(`[api/sessions] auth.getUserById(${uid}) 실패:`, (e as Error).message);
        }
      }),
    );
  }

  const userMap = new Map<string, { name: string; grade?: number; institute_id?: string }>();
  for (const u of userList) {
    // ★ 이름 폴백 — full_name → auth metadata → email prefix → "(이름 없음)"
    //   users.name 컬럼 없음, phone 표시 X.
    const authName = authNameMap.get(u.id);
    const emailPrefix = u.email ? u.email.split('@')[0] : '';
    const displayName = u.full_name || authName || emailPrefix || '(이름 없음)';
    userMap.set(u.id, { name: displayName, grade: u.grade, institute_id: u.institute_id });
  }
  const examMap = new Map<string, { title: string; institute_id?: string }>();
  for (const e of (examsData || []) as Array<{ id: string; title?: string; institute_id?: string }>) {
    examMap.set(e.id, { title: e.title || '', institute_id: e.institute_id });
  }

  const sessions = rows
    .map(r => {
      const stu = userMap.get(r.student_id as string);
      const ex = examMap.get(r.exam_id as string);
      return {
        id: r.session_id as string,
        student_id: r.student_id as string,
        student_name: stu?.name || '(이름 없음)',
        student_grade: stu?.grade ?? null,
        student_institute_id: stu?.institute_id,
        exam_id: r.exam_id as string,
        exam_title: ex?.title || '',
        exam_institute_id: ex?.institute_id,
        round_number: r.round_number as number,
        session_type: r.session_type as string,
        issued_at: r.issued_at as string,
        started_at: (r.started_at as string) || null,
        completed_at: (r.completed_at as string) || null,
        problems_total: Number(r.problems_total || 0),
        problems_graded: Number(r.problems_graded || 0),
        correct_cnt: Number(r.correct_cnt || 0),
        score_pct: r.score_pct == null ? null : Number(r.score_pct),
      };
    })
    .filter(s => {
      // institute 가드 — super_admin 통과, 그 외 자기 institute 한정.
      if (scope.isSuperAdmin) return true;
      const allowed = new Set(scope.accessibleInstituteIds || []);
      // 공통 풀 (institute_id null) 은 exam 일 수 있음 (problems 공통풀과 같은 정책).
      // 다만 채점 세션은 학생 단위라 student_institute_id 가 우선.
      if (s.student_institute_id && allowed.has(s.student_institute_id)) return true;
      if (s.exam_institute_id && allowed.has(s.exam_institute_id)) return true;
      return false;
    })
    .map(({ student_institute_id, exam_institute_id, ...rest }) => rest);

  return NextResponse.json({ sessions });
}

type SessionType = 'BS' | 'DD' | 'PT' | 'SC';
const VALID_TYPES: SessionType[] = ['BS', 'DD', 'PT', 'SC'];

interface CreateBody {
  exam_id?: string;
  student_ids?: string[];
  round_number?: number;
  session_type?: SessionType;
  teacher_note?: string;
  issued_by?: string;
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const examId = body.exam_id;
  const studentIds = Array.isArray(body.student_ids) ? body.student_ids.filter(s => typeof s === 'string') : [];
  const roundNumber = Number.isInteger(body.round_number) && body.round_number! > 0 ? body.round_number! : 1;
  const sessionType: SessionType = VALID_TYPES.includes((body.session_type as SessionType)) ? (body.session_type as SessionType) : 'BS';
  const teacherNote = body.teacher_note || null;
  const issuedBy = body.issued_by || null;

  if (!examId) return NextResponse.json({ error: 'exam_id required' }, { status: 400 });
  if (studentIds.length === 0) return NextResponse.json({ error: 'student_ids 배열 필요' }, { status: 400 });

  // 1) exam 격리 가드 + 확인
  const examGuard = await assertExamAccess(sb, examId, scope);
  if (!examGuard.ok) return NextResponse.json({ error: examGuard.error }, { status: examGuard.status });
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title')
    .eq('id', examId)
    .single();
  if (examErr || !exam) {
    return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 404 });
  }

  // 2) exam_problems (sequence_number 순)
  const { data: examProblems, error: epErr } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (epErr) {
    return NextResponse.json({ error: epErr.message }, { status: 500 });
  }
  if (!examProblems || examProblems.length === 0) {
    return NextResponse.json({ error: '시험지에 문제가 없습니다' }, { status: 400 });
  }

  const problemIds = examProblems.map((ep: any) => ep.problem_id as string);

  // 3) classifications — type_code / difficulty 스냅샷용
  const { data: classData } = await sb
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty')
    .in('problem_id', problemIds);
  const classMap = new Map<string, { type_code: string; difficulty: number | null }>();
  for (const c of (classData || []) as any[]) {
    const tc = (c.type_code as string) || (c.expanded_type_code as string) || '';
    let diff: number | null = null;
    if (c.difficulty != null) {
      const n = typeof c.difficulty === 'number' ? c.difficulty : parseInt(String(c.difficulty), 10);
      if (!isNaN(n) && n >= 1 && n <= 10) diff = n;
    }
    classMap.set(c.problem_id as string, { type_code: tc, difficulty: diff });
  }

  // 4) 학생별 세션 생성
  const created: Array<{ session_id: string; student_id: string; problem_count: number }> = [];
  const skipped: Array<{ student_id: string; reason: string }> = [];

  for (const studentId of studentIds) {
    // 4-a) print_sessions INSERT (UNIQUE 제약 충돌 시 건너뜀)
    const { data: insSession, error: insErr } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .insert({
        student_id: studentId,
        exam_id: examId,
        round_number: roundNumber,
        session_type: sessionType,
        teacher_note: teacherNote,
        issued_by: issuedBy,
      })
      .select('id')
      .single();

    if (insErr || !insSession) {
      // UNIQUE 위반은 "이미 존재" 로 간주
      if (insErr && /duplicate|unique/i.test(insErr.message)) {
        skipped.push({ student_id: studentId, reason: '이미 같은 (학생, 시험지, 회차) 세션 존재' });
      } else {
        skipped.push({ student_id: studentId, reason: insErr?.message || 'INSERT 실패' });
      }
      continue;
    }

    const sessionId = insSession.id as string;

    // 4-b) session_problems 벌크 INSERT
    const rows = examProblems.map((ep: any) => {
      const cls = classMap.get(ep.problem_id as string);
      return {
        session_id: sessionId,
        problem_id: ep.problem_id as string,
        sequence_number: ep.sequence_number as number,
        type_code_snapshot: cls?.type_code || null,
        difficulty_snapshot: cls?.difficulty ?? null,
      };
    });

    const { error: spErr } = await sb
      .schema('diagnostics' as never)
      .from('session_problems')
      .insert(rows);

    if (spErr) {
      console.error(`[sessions] session_problems insert error for session ${sessionId}:`, spErr.message);
      // 세션 롤백 (cascade 로 session_problems 도 정리)
      await sb.schema('diagnostics' as never).from('print_sessions').delete().eq('id', sessionId);
      skipped.push({ student_id: studentId, reason: `session_problems INSERT 실패: ${spErr.message}` });
      continue;
    }

    created.push({ session_id: sessionId, student_id: studentId, problem_count: rows.length });
  }

  return NextResponse.json({ created, skipped, exam: { id: exam.id, title: exam.title } });
}
