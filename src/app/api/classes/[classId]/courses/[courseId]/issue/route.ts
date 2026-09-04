// ============================================================================
// POST /api/classes/[classId]/courses/[courseId]/issue — 회차 내기
// ----------------------------------------------------------------------------
// docs/PLAN_COURSE_LAYER.md C3. 매쓰홀릭 「학습 내기」 대응.
//
// body { stepIds?: string[], next?: number, dueAt?: string|null, preview?: boolean }
//   stepIds  이 회차들을 낸다 (아직 안 낸 것만)
//   next     안 낸 회차를 순서대로 N개 낸다 (stepIds 없을 때)
//
// 회차 하나 = 문항 추출 → 시험지 → 과제(반 전원) → course_steps.assignment_id.
//   · 문항은 회차의 level_plan(밴드별 수)대로 그 소단원(depth4 아래 전 유형)에서 뽑는다.
//   · 이 코스에서 이미 낸 문제, 반 학생이 이미 푼 문제는 뺀다(cell-problems 와 같은 원칙).
//   · 세부유형 분산 — 한 유형만 몰리지 않게 유형별로 한 바퀴씩.
//   · AI 0. 만들다 실패하면 그 회차는 되돌리고(껍데기 금지) 다음 회차로 간다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { resolveClassStudents } from '@/lib/class/class-students';
import { BAND_SCHEMES } from '@/lib/class/mastery-bands';
import { loadCourse } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; courseId: string }> }

interface StepRec {
  id: string; seq: number; unit_code: string; label: string;
  level_plan: Record<string, number>; assignment_id: string | null;
}

const MAX_PER_CALL = 30;

function levelsOfBand(band: string): string[] {
  for (const scheme of [4, 6] as const) {
    const b = BAND_SCHEMES[scheme].find((x) => x.key === band);
    if (b) return [...b.levels];
  }
  return [];
}

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

  let body: { stepIds?: unknown; next?: unknown; dueAt?: unknown; preview?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const preview = body.preview === true;
  const dueAt = typeof body.dueAt === 'string' && body.dueAt ? body.dueAt : null;

  // ── 낼 회차 고르기 ──
  const { data: sRows } = await sb
    .from('course_steps')
    .select('id, seq, unit_code, label, level_plan, assignment_id')
    .eq('course_id', courseId)
    .order('seq');
  const all = (sRows ?? []) as StepRec[];
  let targets: StepRec[];
  if (Array.isArray(body.stepIds) && body.stepIds.length > 0) {
    const want = new Set((body.stepIds as unknown[]).map(String));
    targets = all.filter((s) => want.has(s.id) && !s.assignment_id);
  } else {
    const n = Math.max(1, Math.round(Number(body.next) || 1));
    targets = all.filter((s) => !s.assignment_id).slice(0, n);
  }
  if (targets.length === 0) return NextResponse.json({ error: '낼 회차가 없습니다 (이미 다 냈거나 고른 회차가 없음)' }, { status: 400 });
  if (targets.length > MAX_PER_CALL) return NextResponse.json({ error: `한 번에 ${MAX_PER_CALL}회차까지` }, { status: 400 });

  // ── 반 학생 ──
  const roster = await resolveClassStudents(sb, classId);
  if (roster.studentIds.length === 0) return NextResponse.json({ error: '이 반에 등록된 학생이 없습니다' }, { status: 400 });

  // ── 뺄 문제: 이 코스가 이미 낸 문제 + 반 학생이 이미 푼 문제 ──
  const used = new Set<string>();
  const issuedAssignments = all.map((s) => s.assignment_id).filter((x): x is string => !!x);
  if (issuedAssignments.length > 0) {
    const { data: aRows } = await sb.from('assignments').select('exam_id').in('id', issuedAssignments);
    const examIds = ((aRows ?? []) as Array<{ exam_id: string | null }>).map((a) => a.exam_id).filter((x): x is string => !!x);
    for (let i = 0; i < examIds.length; i += 200) {
      const { data } = await sb.from('exam_problems').select('problem_id').in('exam_id', examIds.slice(i, i + 200));
      for (const r of (data ?? []) as Array<{ problem_id: string }>) used.add(r.problem_id);
    }
  }
  if (roster.allRefs.length > 0) {
    const { data: ps } = await sb
      .schema('diagnostics' as never).from('print_sessions').select('id').in('student_id', roster.allRefs);
    const sessionIds = ((ps ?? []) as Array<{ id: string }>).map((s) => s.id);
    for (let i = 0; i < sessionIds.length; i += 300) {
      const chunk = sessionIds.slice(i, i + 300);
      for (let from = 0; ; from += 1000) {
        const { data } = await sb
          .schema('diagnostics' as never).from('session_results').select('problem_id')
          .in('session_id', chunk).order('id').range(from, from + 999);
        const rows = (data ?? []) as Array<{ problem_id: string | null }>;
        for (const r of rows) if (r.problem_id) used.add(r.problem_id);
        if (rows.length < 1000) break;
      }
    }
  }

  // ── 소단원 이름 ──
  const unitCodes = Array.from(new Set(targets.map((t) => t.unit_code)));
  const { data: nameRows } = await sb.from('mathsecr_types').select('code, level3_name').in('code', unitCodes);
  const unitName = new Map(((nameRows ?? []) as Array<{ code: string; level3_name: string | null }>).map((r) => [r.code, r.level3_name || r.code]));
  const { data: cls } = await sb.from('classes').select('name').eq('id', classId).maybeSingle();
  const className = (cls as { name: string } | null)?.name ?? '';

  // ── 회차별 문항 뽑기 ──
  async function pickForStep(step: StepRec): Promise<{ ids: string[]; short: Record<string, number> }> {
    const ids: string[] = [];
    const short: Record<string, number> = {};
    for (const [band, want] of Object.entries(step.level_plan ?? {})) {
      const n = Number(want) || 0;
      if (n <= 0) continue;
      const levels = levelsOfBand(band);
      if (levels.length === 0) { short[band] = n; continue; }
      const { data: clsRows } = await sb
        .from('classifications')
        .select('problem_id, type_code, problems!inner(deleted_at)')
        .or(`type_code.eq.${step.unit_code},type_code.like.${step.unit_code}-%`)
        .in('difficulty', levels)
        .is('problems.deleted_at', null)
        .limit(Math.max(n * 12, 40));
      const cands = ((clsRows ?? []) as Array<{ problem_id: string; type_code: string | null }>)
        .filter((c) => !used.has(c.problem_id) && !ids.includes(c.problem_id));
      if (cands.length === 0) { short[band] = n; continue; }
      let pq = sb.from('problems').select('id').in('id', cands.map((c) => c.problem_id)).is('deleted_at', null);
      pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
      pq = applyTrackFilter(pq, scope);
      const { data: probs } = await pq;
      const ok = new Set(((probs ?? []) as Array<{ id: string }>).map((p) => p.id));
      const usable = cands.filter((c) => ok.has(c.problem_id));
      // 세부유형 분산
      const byType = new Map<string, string[]>();
      for (const c of usable) {
        const k = c.type_code ?? '';
        if (!byType.has(k)) byType.set(k, []);
        byType.get(k)!.push(c.problem_id);
      }
      const ordered: string[] = [];
      let progressed = true;
      while (progressed && ordered.length < usable.length) {
        progressed = false;
        for (const arr of byType.values()) {
          const next = arr.shift();
          if (next) { ordered.push(next); progressed = true; }
        }
      }
      const picked = ordered.slice(0, n);
      ids.push(...picked);
      if (picked.length < n) short[band] = n - picked.length;
    }
    return { ids, short };
  }

  const results: Array<{
    stepId: string; seq: number; label: string; unitName: string; problems: number;
    short: Record<string, number>; assignmentId?: string; examId?: string; error?: string;
  }> = [];

  for (const step of targets) {
    const uName = unitName.get(step.unit_code) ?? step.unit_code;
    const { ids, short } = await pickForStep(step);
    const base = { stepId: step.id, seq: step.seq, label: step.label, unitName: uName, problems: ids.length, short };
    if (ids.length === 0) { results.push({ ...base, error: '뽑을 문제가 없습니다' }); continue; }
    if (preview) { results.push(base); continue; }

    const title = `${course.title} · ${uName} ${step.label}`;
    // 1) 시험지
    const { data: exam, error: examErr } = await sb
      .from('exams')
      .insert({
        title, description: `코스 회차 · ${className}`, status: 'DRAFT', created_by: user.id,
        institute_id: course.institute_id, total_points: ids.length * 4,
        time_limit_minutes: Math.max(10, ids.length * 2), subject_track: 'math',
      })
      .select('id').single();
    if (examErr || !exam) { results.push({ ...base, error: `시험지 생성 실패: ${examErr?.message ?? 'unknown'}` }); continue; }
    const examId = (exam as { id: string }).id;
    const { error: epErr } = await sb.from('exam_problems').insert(
      ids.map((pid, i) => ({ exam_id: examId, problem_id: pid, sequence_number: i + 1, points: 4 }))
    );
    if (epErr) {
      await sb.from('exams').delete().eq('id', examId);
      results.push({ ...base, error: `문항 연결 실패: ${epErr.message}` }); continue;
    }
    // 2) 과제
    const { data: created, error: aErr } = await sb
      .from('assignments')
      .insert({
        class_id: classId, institute_id: course.institute_id, title, kind: 'unit', exam_id: examId,
        due_at: dueAt, note: null, created_by: user.id, course_step_id: step.id,
      })
      .select('id').single();
    if (aErr || !created) {
      await sb.from('exam_problems').delete().eq('exam_id', examId);
      await sb.from('exams').delete().eq('id', examId);
      results.push({ ...base, error: `과제 생성 실패: ${aErr?.message ?? 'unknown'}` }); continue;
    }
    const assignmentId = (created as { id: string }).id;
    const { error: linkErr } = await sb.from('assignment_students').insert(
      roster.studentIds.map((sid) => ({ assignment_id: assignmentId, student_id: sid }))
    );
    if (linkErr) {
      await sb.from('assignments').delete().eq('id', assignmentId);
      await sb.from('exam_problems').delete().eq('exam_id', examId);
      await sb.from('exams').delete().eq('id', examId);
      results.push({ ...base, error: `대상 학생 등록 실패: ${linkErr.message}` }); continue;
    }
    // 3) 회차 ← 과제
    const { error: stErr } = await sb
      .from('course_steps')
      .update({ assignment_id: assignmentId, issued_at: new Date().toISOString() })
      .eq('id', step.id);
    if (stErr) { results.push({ ...base, assignmentId, examId, error: `회차 연결 실패: ${stErr.message}` }); continue; }
    for (const id of ids) used.add(id);   // 같은 호출 안 다음 회차에서 겹치지 않게
    results.push({ ...base, assignmentId, examId });
  }

  const issued = results.filter((r) => r.assignmentId && !r.error).length;
  return NextResponse.json({ preview, issued, results }, { status: preview ? 200 : 201 });
}
