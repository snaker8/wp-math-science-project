// ============================================================================
// /api/classes/[classId]/assignments — 반 과제
//   GET  목록 + 제출 현황
//   POST 과제 만들기 (시험지 + 대상 학생 + 기간)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 3.
//
// ★ 제출 여부를 assignment_students 에 박아두고 그걸 읽지 않는다.
//   "이 학생이 이 시험지를 쳤나" 의 **사실은 채점 세션**(diagnostics.print_sessions)에 있다.
//   같은 사실을 두 곳에 쓰면 반드시 어긋난다 — 채점 라인이 둘로 갈려 리포트마다
//   한쪽만 보이던 게 정확히 그 사고였다(2026-09-02 통합).
//   그래서 제출 현황은 **매번 채점 세션에서 계산**한다. status 컬럼은 면제(excused)
//   같은 사람 판단을 적는 자리로만 쓴다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

export type AssignmentKind = 'unit' | 'wrong' | 'weak' | 'type';

export interface AssignmentRow {
  id: string;
  title: string;
  kind: AssignmentKind;
  examId: string | null;
  examTitle: string | null;
  startsAt: string;
  dueAt: string | null;
  note: string | null;
  total: number;        // 대상 학생 수
  submitted: number;    // 채점 세션이 붙은 학생 수
  excused: number;
  avgPct: number | null;
  students: Array<{
    id: string;
    name: string;
    status: 'assigned' | 'submitted' | 'graded' | 'excused';
    submitted: boolean;
    correctPct: number | null;
    gradedAt: string | null;
  }>;
}

/** 반 접근 확인 — 없으면 응답을 그대로 돌려준다 */
async function guardClass(classId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const { data: cls } = await supabaseAdmin!
    .from('classes')
    .select('id, name, institute_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, cls: cls as { id: string; name: string; institute_id: string | null } };
}

// ============================================================================
// GET
// ============================================================================
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const guard = await guardClass(classId, authed.data.scope);
  if (!guard.ok) return guard.res;

  const { data: aRows } = await sb
    .from('assignments')
    .select('id, title, kind, exam_id, starts_at, due_at, note')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: false });
  const assignments = (aRows ?? []) as Array<{
    id: string; title: string; kind: AssignmentKind; exam_id: string | null;
    starts_at: string; due_at: string | null; note: string | null;
  }>;
  if (assignments.length === 0) return NextResponse.json({ assignments: [] });

  // 대상 학생
  const { data: asRows } = await sb
    .from('assignment_students')
    .select('assignment_id, student_id, session_id, status')
    .in('assignment_id', assignments.map((a) => a.id));
  const targets = (asRows ?? []) as Array<{
    assignment_id: string; student_id: string; session_id: string | null;
    status: 'assigned' | 'submitted' | 'graded' | 'excused';
  }>;

  // 이름 — users 우선, 없으면 명단(roster)
  const studentIds = Array.from(new Set(targets.map((t) => t.student_id)));
  const nameById = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: us } = await sb.from('users').select('id, full_name, email').in('id', studentIds);
    for (const u of (us ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      nameById.set(u.id, u.full_name || u.email?.split('@')[0] || '(이름 없음)');
    }
    const missing = studentIds.filter((id) => !nameById.has(id));
    if (missing.length > 0) {
      const { data: rs } = await sb.from('roster_students').select('id, full_name').in('id', missing);
      for (const r of (rs ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameById.set(r.id, r.full_name || '(이름 없음)');
      }
    }
  }

  // 신원 병합 — 승격 전 명단 id 도 채점 세션 후보다
  const refsOf = new Map<string, string[]>(studentIds.map((id) => [id, [id]]));
  if (studentIds.length > 0) {
    const { data: rs } = await sb
      .from('roster_students').select('id, promoted_user_id').in('promoted_user_id', studentIds);
    for (const r of (rs ?? []) as Array<{ id: string; promoted_user_id: string }>) {
      refsOf.get(r.promoted_user_id)?.push(r.id);
    }
  }
  const allRefs = Array.from(new Set(Array.from(refsOf.values()).flat()));

  // 채점 세션 — 과제가 가리키는 시험지들에 한정
  const examIds = Array.from(new Set(assignments.map((a) => a.exam_id).filter((x): x is string => !!x)));
  type Sess = { id: string; student_id: string; exam_id: string; completed_at: string | null };
  const sessions: Sess[] = [];
  if (examIds.length > 0 && allRefs.length > 0) {
    const { data } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id, student_id, exam_id, completed_at')
      .in('exam_id', examIds)
      .in('student_id', allRefs);
    sessions.push(...((data ?? []) as Sess[]));
  }

  // 세션별 정답률 — ★ 1,000행 한계. 반 × 회차가 쌓이면 바로 걸린다.
  const score = new Map<string, { graded: number; correct: number }>();
  const sessIds = sessions.map((s) => s.id);
  for (let i = 0; i < sessIds.length; i += 300) {
    const chunk = sessIds.slice(i, i + 300);
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, teacher_note')
        .in('session_id', chunk)
        .order('id')
        .range(from, from + 999);
      const rows = (data ?? []) as Array<{ session_id: string; is_correct: boolean; teacher_note: string | null }>;
      for (const r of rows) {
        if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;
        const s = score.get(r.session_id) ?? { graded: 0, correct: 0 };
        s.graded += 1;
        if (r.is_correct) s.correct += 1;
        score.set(r.session_id, s);
      }
      if (rows.length < 1000) break;
    }
  }

  // (exam, ref) → 채점된 세션
  const sessByKey = new Map<string, Sess>();
  for (const s of sessions) {
    if (!score.has(s.id)) continue;   // 배포만 되고 안 친 세션은 제출이 아니다
    const key = `${s.exam_id}|${s.student_id}`;
    const prev = sessByKey.get(key);
    if (!prev || (s.completed_at ?? '') > (prev.completed_at ?? '')) sessByKey.set(key, s);
  }

  const examTitle = new Map<string, string>();
  if (examIds.length > 0) {
    const { data: ex } = await sb.from('exams').select('id, title').in('id', examIds);
    for (const e of (ex ?? []) as Array<{ id: string; title: string }>) examTitle.set(e.id, e.title);
  }

  const byAssignment = new Map<string, typeof targets>();
  for (const t of targets) {
    const arr = byAssignment.get(t.assignment_id) ?? [];
    arr.push(t);
    byAssignment.set(t.assignment_id, arr);
  }

  const out: AssignmentRow[] = assignments.map((a) => {
    const ts = byAssignment.get(a.id) ?? [];
    const students = ts.map((t) => {
      const refs = refsOf.get(t.student_id) ?? [t.student_id];
      const sess = a.exam_id
        ? refs.map((r) => sessByKey.get(`${a.exam_id}|${r}`)).find(Boolean)
        : undefined;
      const sc = sess ? score.get(sess.id) : undefined;
      return {
        id: t.student_id,
        name: nameById.get(t.student_id) ?? '(이름 없음)',
        status: t.status,
        submitted: !!sess,
        correctPct: sc && sc.graded > 0 ? Math.round((sc.correct * 100) / sc.graded) : null,
        gradedAt: sess?.completed_at ?? null,
      };
    });
    const done = students.filter((s) => s.submitted);
    const pcts = done.map((s) => s.correctPct).filter((p): p is number => p != null);
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      examId: a.exam_id,
      examTitle: a.exam_id ? (examTitle.get(a.exam_id) ?? null) : null,
      startsAt: a.starts_at,
      dueAt: a.due_at,
      note: a.note,
      total: students.length,
      submitted: done.length,
      excused: students.filter((s) => s.status === 'excused').length,
      avgPct: pcts.length > 0 ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null,
      students: students.sort((x, y) => x.name.localeCompare(y.name, 'ko')),
    };
  });

  return NextResponse.json({ assignments: out });
}

// ============================================================================
// POST — 과제 만들기
//   body: { title, kind?, examId?, dueAt?, note?, studentIds? }
//   studentIds 를 안 주면 **반 전원**(ACCEPTED)에게 낸다 — 그게 기본 동작이다.
// ============================================================================
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const guard = await guardClass(classId, authed.data.scope);
  if (!guard.ok) return guard.res;

  let body: {
    title?: string; kind?: AssignmentKind; examId?: string | null;
    dueAt?: string | null; note?: string | null; studentIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: '과제 이름이 필요합니다' }, { status: 400 });
  const kind: AssignmentKind = body.kind ?? 'unit';
  if (!['unit', 'wrong', 'weak', 'type'].includes(kind)) {
    return NextResponse.json({ error: 'kind 가 올바르지 않습니다' }, { status: 400 });
  }

  // 시험지가 지정됐으면 접근 권한을 확인한다 — 남의 학원 시험지를 과제로 걸 수 없다
  if (body.examId) {
    const { data: exam } = await sb
      .from('exams').select('id, institute_id').eq('id', body.examId).is('deleted_at', null).maybeSingle();
    if (!exam) return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 400 });
    const instId = (exam as { institute_id: string | null }).institute_id;
    if (instId !== null) {
      try {
        assertInstituteAccess(authed.data.scope, instId);
      } catch {
        return NextResponse.json({ error: '이 시험지에 접근할 수 없습니다' }, { status: 403 });
      }
    }
  }

  // 대상 학생 — 미지정이면 반 전원
  let studentIds = (body.studentIds ?? []).filter(Boolean);
  if (studentIds.length === 0) {
    const { data: en } = await sb
      .from('class_enrollments')
      .select('student_id')
      .eq('class_id', classId)
      .eq('status', 'ACCEPTED');
    studentIds = Array.from(new Set(((en ?? []) as Array<{ student_id: string }>).map((e) => e.student_id)));
  }
  if (studentIds.length === 0) {
    return NextResponse.json({ error: '이 반에 등록된 학생이 없습니다' }, { status: 400 });
  }

  const { data: created, error: insErr } = await sb
    .from('assignments')
    .insert({
      class_id: classId,
      institute_id: guard.cls.institute_id,
      title,
      kind,
      exam_id: body.examId ?? null,
      due_at: body.dueAt ?? null,
      note: body.note ?? null,
      created_by: authed.data.user.id,
    })
    .select('id')
    .single();
  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? '과제 생성 실패' }, { status: 500 });
  }
  const assignmentId = (created as { id: string }).id;

  const { error: linkErr } = await sb.from('assignment_students').insert(
    studentIds.map((sid) => ({ assignment_id: assignmentId, student_id: sid }))
  );
  if (linkErr) {
    // ★ 대상이 하나도 안 붙은 과제는 쓸모가 없다 — 껍데기를 남기지 않는다.
    //   (시험지 자산화에서 exam 만 만들고 문제가 안 붙어 고생한 사고와 같은 종류)
    await sb.from('assignments').delete().eq('id', assignmentId);
    return NextResponse.json({ error: `대상 학생 등록 실패: ${linkErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ id: assignmentId, count: studentIds.length }, { status: 201 });
}

// ============================================================================
// DELETE ?id=<assignmentId> — 과제 삭제 (소프트)
//   과제만 지운다. 채점 기록은 과제와 별개 사실이라 건드리지 않는다.
// ============================================================================
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const guard = await guardClass(classId, authed.data.scope);
  if (!guard.ok) return guard.res;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다' }, { status: 400 });

  // ★ class_id 를 조건에 같이 건다 — 다른 반 과제 id 를 알아도 못 지운다.
  const { error, count } = await sb
    .from('assignments')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id)
    .eq('class_id', classId)
    .is('deleted_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: '과제를 찾을 수 없습니다' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
