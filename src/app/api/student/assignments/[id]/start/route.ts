// ============================================================================
// POST /api/student/assignments/[id]/start — 과제 풀기 시작 → 채점 세션 id
// ----------------------------------------------------------------------------
// 과제를 배포해도 학생별 채점 세션(print_sessions)은 생기지 않는다(선생님 「출제」 때만 생김).
// 그래서 학생이 처음 열 때 만든다. 이미 있으면(선생님이 출제했거나 전에 열었으면) 그걸 쓴다.
//   · 끝나지 않은 세션이 있으면 그 세션
//   · 없고, 끝난 세션만 있으면 그 세션(결과 보기). 다시 풀기는 별도 기능.
//   · 아무것도 없으면 새로 만든다 — session_type 'WS'(학습지), 회차는 1.
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveStudentIdentity } from '@/lib/diagnostics/find-session';
import { findOrCreateStudentSession } from '@/lib/sessions/create-session';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const myIds = await resolveStudentIdentity(sb, user.id);

  // 나에게 온 과제인가
  const { data: target } = await sb
    .from('assignment_students')
    .select('student_id, status')
    .eq('assignment_id', params.id)
    .in('student_id', myIds)
    .limit(1)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: '나에게 배포된 과제가 아닙니다' }, { status: 403 });
  if ((target as { status: string }).status === 'excused') {
    return NextResponse.json({ error: '면제된 과제입니다' }, { status: 403 });
  }

  const { data: a } = await sb
    .from('assignments')
    .select('id, exam_id, starts_at, deleted_at, created_by')
    .eq('id', params.id)
    .maybeSingle();
  const assignment = a as { id: string; exam_id: string | null; starts_at: string; deleted_at: string | null; created_by: string | null } | null;
  if (!assignment || assignment.deleted_at || !assignment.exam_id) {
    return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });
  }
  if (assignment.starts_at && new Date(assignment.starts_at).getTime() > Date.now()) {
    return NextResponse.json({ error: '아직 시작 전인 과제입니다' }, { status: 403 });
  }
  const examId = assignment.exam_id;

  const r = await findOrCreateStudentSession(sb, {
    examId, myIds, userId: user.id, teacherNote: '학생 화면 풀이', issuedBy: assignment.created_by,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ session_id: r.sessionId, created: r.created });
}
