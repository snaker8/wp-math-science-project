// ============================================================================
// /api/classes/[classId]/students/[studentId]/history — 학생 화면: 학습 이력
//   GET   날짜순 학습 기록 (채점 세션 = 라인 B) + 종류 라벨 + 교사 코멘트 + 요약(회차 진행도·정답률)
//   PATCH { sessionId, comment } — 이력에 교사 코멘트 (print_sessions.teacher_note)
// ----------------------------------------------------------------------------
// 매쓰홀릭 학생 화면(09 §5-2). 재료 계산은 lib/class/student-history (학부모 리포트와 공유).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName, gradeLabel } from '@/lib/class/class-students';
import { buildStudentHistory } from '@/lib/class/student-history';

export type { HistoryItem, LogKind } from '@/lib/class/student-history';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; studentId: string }> }

async function guard(classId: string, studentId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const sb = supabaseAdmin!;
  const { data: cls } = await sb.from('classes').select('id, name, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  const c = cls as { id: string; name: string; institute_id: string | null };
  try { assertInstituteAccess(scope, c.institute_id); } catch { return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }; }
  const roster = await resolveClassStudents(sb, classId);
  if (!roster.studentIds.includes(studentId)) return { ok: false as const, res: NextResponse.json({ error: '이 반 학생이 아닙니다' }, { status: 404 }) };
  return { ok: true as const, cls: c, roster };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  const { roster, cls } = g;
  const refs = roster.refsByStudent.get(studentId) ?? [studentId];
  const u = roster.userById.get(studentId);
  const { items, summary } = await buildStudentHistory(supabaseAdmin, classId, refs);
  return NextResponse.json({
    class: { id: cls.id, name: cls.name },
    student: { id: studentId, name: displayName(u), grade: gradeLabel(u?.grade ?? null) },
    summary, items,
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  let body: { sessionId?: unknown; comment?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
  if (!sessionId) return NextResponse.json({ error: 'sessionId 가 필요합니다' }, { status: 400 });
  const refs = g.roster.refsByStudent.get(studentId) ?? [studentId];
  const { data: s } = await sb.schema('diagnostics' as never).from('print_sessions').select('id, student_id').eq('id', sessionId).maybeSingle();
  if (!s || !refs.includes((s as { student_id: string }).student_id)) return NextResponse.json({ error: '이 학생의 기록이 아닙니다' }, { status: 404 });
  const { error } = await sb.schema('diagnostics' as never).from('print_sessions').update({ teacher_note: comment || null }).eq('id', sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
