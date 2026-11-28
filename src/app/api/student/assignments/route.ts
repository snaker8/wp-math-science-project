// ============================================================================
// GET /api/student/assignments — 내 과제 목록 (태블릿·노트북 풀이)
// ----------------------------------------------------------------------------
// 선생님이 반에 배포한 과제(assignments + assignment_students) 중 나에게 온 것.
// 진행 상태는 채점 세션(diagnostics.print_sessions + session_results)에서 계산한다 —
// 선생님 과제 현황(/api/classes/[classId]/assignments)과 같은 규칙.
//   · 세션 없음/결과 0       → 'todo'   (시작 전)
//   · 결과 일부 / 미완료      → 'doing'  (QR·선생님 채점이 일부만 된 경우)
//   · completed_at 있음       → 'done'   (점수 표시. 자동채점 보류 문항은 점수에서 뺀다)
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveStudentIdentity } from '@/lib/diagnostics/find-session';

export const dynamic = 'force-dynamic';

export interface StudentAssignmentItem {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  class_name: string | null;
  exam_id: string;
  exam_title: string;
  problem_count: number;
  starts_at: string;
  due_at: string | null;
  status: 'todo' | 'doing' | 'done';
  session_id: string | null;
  graded: number;
  correct: number;
  held: number;
  score_pct: number | null;
  completed_at: string | null;
}

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const myIds = await resolveStudentIdentity(sb, user.id);

  const { data: targets, error: tErr } = await sb
    .from('assignment_students')
    .select('assignment_id, student_id, status')
    .in('student_id', myIds)
    .neq('status', 'excused');
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const assignmentIds = Array.from(new Set(((targets ?? []) as Array<{ assignment_id: string }>).map((t) => t.assignment_id)));
  if (assignmentIds.length === 0) return NextResponse.json({ assignments: [] });

  const { data: aRows, error: aErr } = await sb
    .from('assignments')
    .select('id, title, kind, note, class_id, exam_id, starts_at, due_at')
    .in('id', assignmentIds)
    .is('deleted_at', null)
    .not('exam_id', 'is', null)
    .order('starts_at', { ascending: false });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  const assignments = (aRows ?? []) as Array<{
    id: string; title: string; kind: string; note: string | null; class_id: string | null;
    exam_id: string; starts_at: string; due_at: string | null;
  }>;
  if (assignments.length === 0) return NextResponse.json({ assignments: [] });

  const examIds = Array.from(new Set(assignments.map((a) => a.exam_id)));
  const classIds = Array.from(new Set(assignments.map((a) => a.class_id).filter((x): x is string => !!x)));

  const [{ data: exams }, { data: classes }, { data: epRows }, { data: sessRows }] = await Promise.all([
    sb.from('exams').select('id, title').in('id', examIds),
    classIds.length ? sb.from('classes').select('id, name').in('id', classIds) : Promise.resolve({ data: [] }),
    sb.from('exam_problems').select('exam_id').in('exam_id', examIds),
    sb.schema('diagnostics' as never).from('print_sessions')
      .select('id, exam_id, student_id, completed_at, issued_at')
      .in('exam_id', examIds)
      .in('student_id', myIds),
  ]);

  const examTitle = new Map(((exams ?? []) as Array<{ id: string; title: string }>).map((e) => [e.id, e.title]));
  const className = new Map(((classes ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const problemCount = new Map<string, number>();
  for (const r of (epRows ?? []) as Array<{ exam_id: string }>) problemCount.set(r.exam_id, (problemCount.get(r.exam_id) ?? 0) + 1);

  // 시험지별 가장 최근 세션 (완료된 것 우선)
  type Sess = { id: string; exam_id: string; completed_at: string | null; issued_at: string | null };
  const latest = new Map<string, Sess>();
  for (const s of (sessRows ?? []) as Sess[]) {
    const prev = latest.get(s.exam_id);
    const key = (x: Sess) => `${x.completed_at ?? ''}|${x.issued_at ?? ''}`;
    if (!prev || key(s) > key(prev)) latest.set(s.exam_id, s);
  }
  const sessIds = Array.from(latest.values()).map((s) => s.id);
  const score = new Map<string, { graded: number; correct: number; held: number }>();
  if (sessIds.length > 0) {
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, teacher_note')
        .in('session_id', sessIds)
        .order('id')
        .range(from, from + 999);
      const rows = (data ?? []) as Array<{ session_id: string; is_correct: boolean; teacher_note: string | null }>;
      for (const r of rows) {
        const s = score.get(r.session_id) ?? { graded: 0, correct: 0, held: 0 };
        if ((r.teacher_note ?? '').includes('자동채점 보류')) s.held += 1;
        else {
          s.graded += 1;
          if (r.is_correct) s.correct += 1;
        }
        score.set(r.session_id, s);
      }
      if (rows.length < 1000) break;
    }
  }

  const out: StudentAssignmentItem[] = assignments.map((a) => {
    const sess = latest.get(a.exam_id) ?? null;
    const sc = sess ? score.get(sess.id) : undefined;
    const status: StudentAssignmentItem['status'] = sess?.completed_at ? 'done' : sc ? 'doing' : 'todo';
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      note: a.note,
      class_name: a.class_id ? className.get(a.class_id) ?? null : null,
      exam_id: a.exam_id,
      exam_title: examTitle.get(a.exam_id) ?? '',
      problem_count: problemCount.get(a.exam_id) ?? 0,
      starts_at: a.starts_at,
      due_at: a.due_at,
      status,
      session_id: sess?.id ?? null,
      graded: sc?.graded ?? 0,
      correct: sc?.correct ?? 0,
      held: sc?.held ?? 0,
      score_pct: sc && sc.graded > 0 ? Math.round((sc.correct / sc.graded) * 100) : null,
      completed_at: sess?.completed_at ?? null,
    };
  });

  return NextResponse.json({ assignments: out });
}
