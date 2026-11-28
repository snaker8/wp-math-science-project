// ============================================================================
// 채점 세션 만들기 — print_sessions 1행 + session_problems 스냅샷
// ----------------------------------------------------------------------------
// 선생님 「출제」(POST /api/sessions)와 학생이 과제를 처음 열 때(POST /api/student/assignments/[id]/start)
// 가 같은 모양의 세션을 만들어야 반 허브·숙달·과제 현황이 똑같이 읽는다. 그래서 한 곳에 둔다.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionType = 'BS' | 'DD' | 'PT' | 'SC' | 'WS' | 'EX';
export const VALID_SESSION_TYPES: SessionType[] = ['BS', 'DD', 'PT', 'SC', 'WS', 'EX'];

export interface SessionProblemSnapshot {
  problem_id: string;
  sequence_number: number;
  type_code_snapshot: string | null;
  difficulty_snapshot: number | null;
}

/** 시험지 문항 순서 + 분류 스냅샷. 문항이 없으면 빈 배열 */
export async function loadExamSnapshot(sb: SupabaseClient, examId: string): Promise<SessionProblemSnapshot[]> {
  const { data: examProblems, error } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (error) throw new Error(error.message);
  const eps = (examProblems || []) as Array<{ problem_id: string; sequence_number: number }>;
  if (eps.length === 0) return [];

  const problemIds = eps.map((ep) => ep.problem_id);
  const { data: classData } = await sb
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty')
    .in('problem_id', problemIds);
  const classMap = new Map<string, { type_code: string; difficulty: number | null }>();
  for (const c of (classData || []) as Array<Record<string, unknown>>) {
    const tc = (c.type_code as string) || (c.expanded_type_code as string) || '';
    let diff: number | null = null;
    if (c.difficulty != null) {
      const n = typeof c.difficulty === 'number' ? c.difficulty : parseInt(String(c.difficulty), 10);
      if (!isNaN(n) && n >= 1 && n <= 10) diff = n;
    }
    classMap.set(c.problem_id as string, { type_code: tc, difficulty: diff });
  }

  return eps.map((ep) => {
    const cls = classMap.get(ep.problem_id);
    return {
      problem_id: ep.problem_id,
      sequence_number: ep.sequence_number,
      type_code_snapshot: cls?.type_code || null,
      difficulty_snapshot: cls?.difficulty ?? null,
    };
  });
}

export type CreateSessionResult =
  | { ok: true; sessionId: string; problemCount: number }
  | { ok: false; duplicate: boolean; reason: string };

/** 학생 한 명의 세션 생성. (학생, 시험지, 회차) 가 이미 있으면 duplicate */
export async function createPrintSession(
  sb: SupabaseClient,
  args: {
    examId: string;
    studentId: string;
    snapshot: SessionProblemSnapshot[];
    roundNumber?: number;
    sessionType?: SessionType;
    teacherNote?: string | null;
    issuedBy?: string | null;
  },
): Promise<CreateSessionResult> {
  const { data: ins, error: insErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .insert({
      student_id: args.studentId,
      exam_id: args.examId,
      round_number: args.roundNumber ?? 1,
      session_type: args.sessionType ?? 'BS',
      teacher_note: args.teacherNote ?? null,
      issued_by: args.issuedBy ?? null,
    })
    .select('id')
    .single();

  if (insErr || !ins) {
    const msg = insErr?.message || 'INSERT 실패';
    return { ok: false, duplicate: /duplicate|unique/i.test(msg), reason: msg };
  }
  const sessionId = (ins as { id: string }).id;

  const rows = args.snapshot.map((s) => ({ session_id: sessionId, ...s }));
  const { error: spErr } = await sb.schema('diagnostics' as never).from('session_problems').insert(rows);
  if (spErr) {
    // 세션 롤백 (cascade 로 session_problems 도 정리)
    await sb.schema('diagnostics' as never).from('print_sessions').delete().eq('id', sessionId);
    return { ok: false, duplicate: false, reason: `session_problems INSERT 실패: ${spErr.message}` };
  }
  return { ok: true, sessionId, problemCount: rows.length };
}

export type StudentSessionResult =
  | { ok: true; sessionId: string; created: boolean }
  | { ok: false; status: number; error: string };

/**
 * 학생이 이 시험지를 풀 세션 — 있으면 그것(끝나지 않은 것 우선, 없으면 최근 것), 없으면 새로 만든다.
 * 과제 「풀기 시작」과 인쇄물 QR(/q/[examId])이 같은 규칙을 쓴다.
 *   myIds    = 신원 병합된 학생 id 들 (resolveStudentIdentity) — 승격 전 명단 id 로 만든 세션도 찾는다
 *   userId   = 새로 만들 때 쓸 지금 로그인한 학생 id
 */
export async function findOrCreateStudentSession(
  sb: SupabaseClient,
  args: { examId: string; myIds: string[]; userId: string; teacherNote: string; issuedBy?: string | null },
): Promise<StudentSessionResult> {
  const { data: sess } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, completed_at, issued_at')
    .eq('exam_id', args.examId)
    .in('student_id', args.myIds)
    .order('issued_at', { ascending: false });
  const sessions = (sess ?? []) as Array<{ id: string; completed_at: string | null }>;
  const open = sessions.find((s) => !s.completed_at);
  if (open) return { ok: true, sessionId: open.id, created: false };
  if (sessions.length > 0) return { ok: true, sessionId: sessions[0].id, created: false };

  let snapshot: SessionProblemSnapshot[];
  try {
    snapshot = await loadExamSnapshot(sb, args.examId);
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }
  if (snapshot.length === 0) return { ok: false, status: 400, error: '시험지에 문제가 없습니다' };

  const r = await createPrintSession(sb, {
    examId: args.examId, studentId: args.userId, snapshot, roundNumber: 1, sessionType: 'WS',
    teacherNote: args.teacherNote, issuedBy: args.issuedBy ?? null,
  });
  if (r.ok) return { ok: true, sessionId: r.sessionId, created: true };
  if (r.duplicate) {
    // 동시에 두 번 열었을 때 — 방금 생긴 세션을 돌려준다
    const { data: again } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id')
      .eq('exam_id', args.examId)
      .eq('student_id', args.userId)
      .limit(1)
      .maybeSingle();
    if (again) return { ok: true, sessionId: (again as { id: string }).id, created: false };
  }
  return { ok: false, status: 500, error: r.reason };
}
