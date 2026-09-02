// ============================================================================
// POST /api/classes/[classId]/assignments/from-problems
//   고른 문제들 → 시험지 만들고 → 그 시험지로 과제까지 한 번에.
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 4 (취약 과제 · 오답 과제).
//
// 취약/오답 과제는 "먼저 시험지를 만들고 나중에 과제로 지정" 하는 흐름이 어색하다.
// 약한 유형에서 문제가 뽑혀 나온 그 자리에서 바로 과제가 되어야 한다.
//
// ★ 만들다 실패하면 **되돌린다.** 문제 없는 시험지나 대상 없는 과제 같은 껍데기를
//   남기지 않는다. 자산화에서 exam 만 만들어지고 problems 가 안 붙어 고생한 사고와
//   같은 종류다 (CLAUDE.md 안전 가드 #1).
//
// body: { title, kind, problemIds[], dueAt?, note?, studentIds? }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

type Kind = 'unit' | 'wrong' | 'weak' | 'type';

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope, user } = authed.data;

  // 반 + 격리 가드
  const { data: cls } = await sb
    .from('classes')
    .select('id, name, institute_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  const instituteId = (cls as { institute_id: string | null }).institute_id;
  try {
    assertInstituteAccess(scope, instituteId);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    title?: string; kind?: Kind; problemIds?: string[];
    dueAt?: string | null; note?: string | null; studentIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  const kind: Kind = body.kind ?? 'weak';
  const problemIds = Array.from(new Set((body.problemIds ?? []).filter(Boolean)));
  if (!title) return NextResponse.json({ error: '과제 이름이 필요합니다' }, { status: 400 });
  if (problemIds.length === 0) return NextResponse.json({ error: '문제를 하나 이상 고르세요' }, { status: 400 });
  if (!['unit', 'wrong', 'weak', 'type'].includes(kind)) {
    return NextResponse.json({ error: 'kind 가 올바르지 않습니다' }, { status: 400 });
  }

  // 문제 존재 확인 — 지워진 문제로 시험지를 만들면 빈 칸이 생긴다
  const { data: liveProblems } = await sb
    .from('problems').select('id').in('id', problemIds).is('deleted_at', null);
  const liveIds = ((liveProblems ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (liveIds.length === 0) {
    return NextResponse.json({ error: '고른 문제를 찾을 수 없습니다' }, { status: 400 });
  }
  // 넘어온 순서를 지킨다 (유형별로 묶어 뽑은 순서가 곧 시험지 순서다)
  const ordered = problemIds.filter((id) => liveIds.includes(id));

  // 대상 학생 — 미지정이면 반 전원
  let studentIds = (body.studentIds ?? []).filter(Boolean);
  if (studentIds.length === 0) {
    const { data: en } = await sb
      .from('class_enrollments').select('student_id')
      .eq('class_id', classId).eq('status', 'ACCEPTED');
    studentIds = Array.from(new Set(((en ?? []) as Array<{ student_id: string }>).map((e) => e.student_id)));
  }
  if (studentIds.length === 0) {
    return NextResponse.json({ error: '이 반에 등록된 학생이 없습니다' }, { status: 400 });
  }

  // ── 1) 시험지 ─────────────────────────────────────────────────────────────
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .insert({
      title,
      description: `${kind === 'wrong' ? '오답' : kind === 'weak' ? '취약' : '과제'} 과제 · ${(cls as { name: string }).name}`,
      status: 'DRAFT',
      created_by: user.id,
      institute_id: instituteId,
      total_points: ordered.length * 4,
      time_limit_minutes: Math.max(10, ordered.length * 2),
      subject_track: 'math',
    })
    .select('id')
    .single();
  if (examErr || !exam) {
    return NextResponse.json({ error: `시험지 생성 실패: ${examErr?.message ?? 'unknown'}` }, { status: 500 });
  }
  const examId = (exam as { id: string }).id;

  const { error: epErr } = await sb.from('exam_problems').insert(
    ordered.map((pid, i) => ({
      exam_id: examId,
      problem_id: pid,
      sequence_number: i + 1,
      points: 4,
    }))
  );
  if (epErr) {
    await sb.from('exams').delete().eq('id', examId);   // 되돌린다 — 빈 시험지 금지
    return NextResponse.json({ error: `문항 연결 실패: ${epErr.message}` }, { status: 500 });
  }

  // ── 2) 과제 ──────────────────────────────────────────────────────────────
  const { data: created, error: aErr } = await sb
    .from('assignments')
    .insert({
      class_id: classId,
      institute_id: instituteId,
      title,
      kind,
      exam_id: examId,
      due_at: body.dueAt ?? null,
      note: body.note ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (aErr || !created) {
    await sb.from('exam_problems').delete().eq('exam_id', examId);
    await sb.from('exams').delete().eq('id', examId);
    return NextResponse.json({ error: `과제 생성 실패: ${aErr?.message ?? 'unknown'}` }, { status: 500 });
  }
  const assignmentId = (created as { id: string }).id;

  const { error: linkErr } = await sb.from('assignment_students').insert(
    studentIds.map((sid) => ({ assignment_id: assignmentId, student_id: sid }))
  );
  if (linkErr) {
    await sb.from('assignments').delete().eq('id', assignmentId);
    await sb.from('exam_problems').delete().eq('exam_id', examId);
    await sb.from('exams').delete().eq('id', examId);
    return NextResponse.json({ error: `대상 학생 등록 실패: ${linkErr.message}` }, { status: 500 });
  }

  return NextResponse.json(
    { assignmentId, examId, problems: ordered.length, students: studentIds.length },
    { status: 201 }
  );
}
