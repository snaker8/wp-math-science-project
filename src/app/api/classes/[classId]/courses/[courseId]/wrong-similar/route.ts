// ============================================================================
// POST /api/classes/[classId]/courses/[courseId]/wrong-similar — 회차의 오답유사 학습 만들기
// ----------------------------------------------------------------------------
// docs/PLAN_COURSE_LAYER.md C6. 매쓰홀릭 회차 = 학습 + **오답유사 학습**(학생마다, 틀린 문제와 같은 유형의 새 문제).
//
// body { stepId, preview?: boolean }
//   · 낸 회차만. 채점 세션에서 학생별 틀린 문제를 모은다(라인 B, 자동채점 보류 제외).
//   · 틀린 문제마다 같은 세부유형(depth5, 없으면 소단원) · 난이도 ±1 에서 새 문제 1개. 학생이 본 문제·회차 문제는 뺀다.
//   · 학생마다 시험지 + 과제(kind 'wrong', parent_assignment_id = 회차 과제, course_step_id = 회차, 대상 = 그 학생).
//   · 이미 만든 학생은 건너뛴다. 틀린 게 없는 학생도 건너뛴다. AI 0.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName } from '@/lib/class/class-students';
import { loadCourse } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; courseId: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId, courseId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope, user } = authed.data;
  const g = await loadCourse(classId, courseId, scope);
  if (!g.ok) return g.res;
  const course = g.course;

  let body: { stepId?: unknown; preview?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const preview = body.preview === true;
  const stepId = typeof body.stepId === 'string' ? body.stepId : '';
  if (!stepId) return NextResponse.json({ error: '회차를 고르세요' }, { status: 400 });

  const { data: stepRow } = await sb
    .from('course_steps').select('id, seq, unit_code, label, assignment_id')
    .eq('id', stepId).eq('course_id', courseId).maybeSingle();
  const step = stepRow as { id: string; seq: number; unit_code: string; label: string; assignment_id: string | null } | null;
  if (!step) return NextResponse.json({ error: '회차를 찾을 수 없습니다' }, { status: 404 });
  if (!step.assignment_id) return NextResponse.json({ error: '아직 안 낸 회차입니다' }, { status: 400 });

  const { data: aRow } = await sb.from('assignments').select('id, exam_id').eq('id', step.assignment_id).maybeSingle();
  const examId = (aRow as { exam_id: string | null } | null)?.exam_id;
  if (!examId) return NextResponse.json({ error: '회차 과제에 시험지가 없습니다' }, { status: 400 });

  const { data: nameRow } = await sb.from('mathsecr_types').select('level3_name').eq('code', step.unit_code).maybeSingle();
  const unitName = (nameRow as { level3_name: string | null } | null)?.level3_name ?? step.unit_code;

  // ── 회차 문제 (제외 대상) ──
  const { data: epRows } = await sb.from('exam_problems').select('problem_id').eq('exam_id', examId);
  const stepProblems = new Set(((epRows ?? []) as Array<{ problem_id: string }>).map((r) => r.problem_id));

  // ── 학생별 오답 (채점 세션) ──
  const roster = await resolveClassStudents(sb, classId);
  type Sess = { id: string; student_id: string; completed_at: string | null };
  const { data: sRows } = await sb
    .schema('diagnostics' as never).from('print_sessions')
    .select('id, student_id, completed_at').eq('exam_id', examId).in('student_id', roster.allRefs.length ? roster.allRefs : ['-']);
  const sessions = (sRows ?? []) as Sess[];
  const wrongByStudent = new Map<string, string[]>();
  const gradedByStudent = new Map<string, number>();
  for (const s of sessions) {
    const owner = roster.ownerByRef.get(s.student_id);
    if (!owner) continue;
    const { data } = await sb
      .schema('diagnostics' as never).from('session_results')
      .select('problem_id, is_correct, teacher_note').eq('session_id', s.id);
    const rows = (data ?? []) as Array<{ problem_id: string | null; is_correct: boolean; teacher_note: string | null }>;
    let graded = 0; const wrong: string[] = [];
    for (const r of rows) {
      if (!r.problem_id || (r.teacher_note ?? '').includes('자동채점 보류')) continue;
      graded += 1;
      if (!r.is_correct) wrong.push(r.problem_id);
    }
    // 여러 세션이면 더 많이 채점된 쪽
    if (graded > (gradedByStudent.get(owner) ?? -1)) { gradedByStudent.set(owner, graded); wrongByStudent.set(owner, wrong); }
  }

  // ── 이미 만든 학생 ──
  const { data: madeRows } = await sb
    .from('assignments').select('id, assignment_students(student_id)')
    .eq('parent_assignment_id', step.assignment_id).is('deleted_at', null);
  const already = new Set<string>();
  for (const a of (madeRows ?? []) as Array<{ assignment_students: Array<{ student_id: string }> | null }>) {
    for (const s of a.assignment_students ?? []) already.add(s.student_id);
  }

  // ── 틀린 문제의 유형·난이도 ──
  const allWrong = Array.from(new Set(Array.from(wrongByStudent.values()).flat()));
  const clsOf = new Map<string, { type: string | null; d: number | null }>();
  for (let i = 0; i < allWrong.length; i += 200) {
    const { data } = await sb.from('classifications').select('problem_id, type_code, difficulty').in('problem_id', allWrong.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ problem_id: string; type_code: string | null; difficulty: string | number | null }>) {
      const d = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
      clsOf.set(c.problem_id, { type: c.type_code, d: d != null && Number.isFinite(d) ? d : null });
    }
  }

  // ── 학생이 본 문제 ──
  async function seenOf(studentId: string): Promise<Set<string>> {
    const refs = roster.refsByStudent.get(studentId) ?? [studentId];
    const { data: ps } = await sb.schema('diagnostics' as never).from('print_sessions').select('id').in('student_id', refs);
    const ids = ((ps ?? []) as Array<{ id: string }>).map((s) => s.id);
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.schema('diagnostics' as never).from('session_results')
          .select('problem_id').in('session_id', ids.slice(i, i + 300)).order('id').range(from, from + 999);
        const rows = (data ?? []) as Array<{ problem_id: string | null }>;
        for (const r of rows) if (r.problem_id) seen.add(r.problem_id);
        if (rows.length < 1000) break;
      }
    }
    return seen;
  }

  // ── 유사 문제 하나 뽑기: 같은 세부유형 · 난이도 ±1 → 없으면 소단원 ──
  async function pickSimilar(type: string | null, d: number | null, exclude: Set<string>): Promise<string | null> {
    if (!type) return null;
    const scopes = [type];
    const unit = type.split('-').slice(0, 4).join('-');
    if (unit !== type) scopes.push(unit);
    for (const sc of scopes) {
      let q = sb.from('classifications')
        .select('problem_id, difficulty, problems!inner(deleted_at)')
        .or(`type_code.eq.${sc},type_code.like.${sc}-%`)
        .is('problems.deleted_at', null)
        .limit(60);
      if (d != null) q = q.in('difficulty', [d - 1, d, d + 1].filter((x) => x >= 1 && x <= 10).map(String));
      const { data } = await q;
      const cands = ((data ?? []) as Array<{ problem_id: string; difficulty: string | number | null }>)
        .filter((c) => !exclude.has(c.problem_id));
      if (cands.length === 0) continue;
      let pq = sb.from('problems').select('id').in('id', cands.map((c) => c.problem_id)).is('deleted_at', null);
      pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
      pq = applyTrackFilter(pq, scope);
      const { data: ok } = await pq;
      const okSet = new Set(((ok ?? []) as Array<{ id: string }>).map((p) => p.id));
      // 같은 난이도 먼저
      const sorted = cands.filter((c) => okSet.has(c.problem_id))
        .sort((a, b) => Math.abs(Number(a.difficulty) - (d ?? 0)) - Math.abs(Number(b.difficulty) - (d ?? 0)));
      if (sorted[0]) return sorted[0].problem_id;
    }
    return null;
  }

  const results: Array<{ studentId: string; name: string; wrong: number; problems: number; skipped?: string; assignmentId?: string; examId?: string; error?: string }> = [];
  for (const sid of roster.studentIds) {
    const name = displayName(roster.userById.get(sid));
    const wrong = wrongByStudent.get(sid);
    if (!wrong) { results.push({ studentId: sid, name, wrong: 0, problems: 0, skipped: '미제출' }); continue; }
    if (wrong.length === 0) { results.push({ studentId: sid, name, wrong: 0, problems: 0, skipped: '오답 없음' }); continue; }
    if (already.has(sid)) { results.push({ studentId: sid, name, wrong: wrong.length, problems: 0, skipped: '이미 만듦' }); continue; }

    const exclude = new Set<string>(stepProblems);
    if (!preview) for (const p of await seenOf(sid)) exclude.add(p);
    const picked: string[] = [];
    for (const pid of wrong) {
      const c = clsOf.get(pid);
      const sim = await pickSimilar(c?.type ?? null, c?.d ?? null, exclude);
      if (sim) { picked.push(sim); exclude.add(sim); }
    }
    const base = { studentId: sid, name, wrong: wrong.length, problems: picked.length };
    if (picked.length === 0) { results.push({ ...base, error: '문제은행에 같은 유형의 새 문제가 없습니다 (이미 본 문제·회차 문제 제외)' }); continue; }
    if (preview) { results.push(base); continue; }

    const title = `${course.title} · ${unitName} ${step.label} 오답유사 · ${name}`;
    const { data: exam, error: examErr } = await sb.from('exams').insert({
      title, description: `오답유사 학습 · ${name}`, status: 'DRAFT', created_by: user.id,
      institute_id: course.institute_id, total_points: picked.length * 4,
      time_limit_minutes: Math.max(10, picked.length * 2), subject_track: 'math',
    }).select('id').single();
    if (examErr || !exam) { results.push({ ...base, error: `시험지 생성 실패: ${examErr?.message ?? 'unknown'}` }); continue; }
    const newExamId = (exam as { id: string }).id;
    const { error: epErr } = await sb.from('exam_problems').insert(
      picked.map((pid, i) => ({ exam_id: newExamId, problem_id: pid, sequence_number: i + 1, points: 4 }))
    );
    if (epErr) { await sb.from('exams').delete().eq('id', newExamId); results.push({ ...base, error: `문항 연결 실패: ${epErr.message}` }); continue; }
    const { data: created, error: aErr } = await sb.from('assignments').insert({
      class_id: classId, institute_id: course.institute_id, title, kind: 'wrong', exam_id: newExamId,
      due_at: null, note: null, created_by: user.id, course_step_id: step.id, parent_assignment_id: step.assignment_id,
    }).select('id').single();
    if (aErr || !created) {
      await sb.from('exam_problems').delete().eq('exam_id', newExamId);
      await sb.from('exams').delete().eq('id', newExamId);
      results.push({ ...base, error: `과제 생성 실패: ${aErr?.message ?? 'unknown'}` }); continue;
    }
    const assignmentId = (created as { id: string }).id;
    const { error: linkErr } = await sb.from('assignment_students').insert([{ assignment_id: assignmentId, student_id: sid }]);
    if (linkErr) {
      await sb.from('assignments').delete().eq('id', assignmentId);
      await sb.from('exam_problems').delete().eq('exam_id', newExamId);
      await sb.from('exams').delete().eq('id', newExamId);
      results.push({ ...base, error: `대상 등록 실패: ${linkErr.message}` }); continue;
    }
    results.push({ ...base, assignmentId, examId: newExamId });
  }

  const made = results.filter((r) => r.assignmentId).length;
  return NextResponse.json({ preview, made, results }, { status: preview || made === 0 ? 200 : 201 });
}
