// ============================================================================
// /api/classes/[classId]/courses — 코스(회차 묶음)
//   GET  코스 목록 + 회차 + 학생별 진행도
//   POST 코스 만들기 (과정·범위·계단 → 회차 계획 저장 / preview 면 저장 안 함)
// ----------------------------------------------------------------------------
// docs/PLAN_COURSE_LAYER.md C1·C2. 매쓰홀릭 「수업 = 교재 N회차」 대응.
//
// ★ 진행도 = 제출한 회차 / 전체 회차. 제출은 회차의 과제 → 시험지 → 채점 세션으로 매번 계산한다.
//   course_steps 에 완료 여부를 박지 않는다 (단계 3 원칙 — 같은 사실을 두 곳에 쓰지 않는다).
// ★ 회차 계획은 문제은행 공급(격리·트랙 통과)을 밴드별로 세어 planSteps 로 만든다. AI 0.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter, assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName } from '@/lib/class/class-students';
import { bandOf, type BandScheme, unitOf } from '@/lib/class/mastery-bands';
import { DEFAULT_LADDER, planSteps, summarizePlan, type LadderRung, type UnitSupply } from '@/lib/class/course-ladder';
import { parseLadder } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string }> }

export interface CourseStepRow {
  id: string;
  seq: number;
  unit: string;
  unitName: string;
  unitRound: number;
  label: string;
  rungLabel: string;
  levelPlan: Record<string, number>;
  total: number;
  short: boolean;
  /** 회차 과제 (공통: 1개 · 개인화: 학생마다 1개 → 첫 번째) */
  assignmentId: string | null;
  /** 공통 출제일 때의 시험지. 개인화면 null — exams 를 본다 */
  examId: string | null;
  /** 회차의 시험지들 (개인화: 학생별) */
  exams: Array<{ studentId: string | null; examId: string }>;
  /** 오답유사 학습 시험지들 (학생별) */
  wrongExams: Array<{ studentId: string | null; examId: string }>;
  personal: boolean;
  issuedAt: string | null;
  dueAt: string | null;
  /** 제출 학생 수 · 평균 정답률 (낸 회차만) */
  submitted: number;
  avgPct: number | null;
  /** 오답유사 학습 — 만든 학생 수 / 오답이 있는 제출 학생 수 (C6) */
  wrongSimilar: { made: number; eligible: number };
}

export interface CourseRow {
  id: string;
  title: string;
  subjectCode: string;
  subjectName: string;
  settings: { issueMode: 'common' | 'personal'; perStep: number; ladder: LadderRung[]; range?: { l1?: string[] } };
  createdAt: string;
  steps: CourseStepRow[];
  issued: number;
  /** 학생별 완료 회차 수 */
  progress: Array<{ studentId: string; name: string; done: number }>;
  avgProgressPct: number | null;
}

const PAGE = 1000;

async function guardClass(classId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const { data: cls } = await supabaseAdmin!
    .from('classes').select('id, name, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, cls: cls as { id: string; name: string; institute_id: string | null } };
}

/** 소단원(depth4) 목록 + 이름 — 과목 아래, 대단원 범위로 자른다 */
async function loadUnits(subject: string, l1?: string[]) {
  const sb = supabaseAdmin!;
  const out: Array<{ code: string; name: string; l1: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await sb
      .from('mathsecr_types')
      .select('code, level3_name')
      .like('code', `${subject}-%`)
      .eq('depth', 4)
      .order('code')
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as Array<{ code: string; level3_name: string | null }>;
    for (const r of rows) {
      const l1code = r.code.split('-').slice(0, 2).join('-');
      if (l1 && l1.length > 0 && !l1.includes(l1code)) continue;
      out.push({ code: r.code, name: r.level3_name || r.code, l1: l1code });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** 문제은행 공급 — 소단원 × 밴드 (격리·트랙 통과, 삭제 제외) */
async function loadSupply(subject: string, scope: Parameters<typeof applyInstituteFilter>[1], scheme: BandScheme) {
  const sb = supabaseAdmin!;
  const supply = new Map<string, Record<string, number>>();
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from('problems')
      .select('id, classifications!inner(type_code, difficulty)')
      .like('classifications.type_code', `${subject}-%`)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE - 1);
    q = applyInstituteFilter(q, scope, { allowCommonPool: true });
    q = applyTrackFilter(q, scope);
    const { data } = await q;
    const rows = (data ?? []) as Array<{
      id: string;
      classifications: Array<{ type_code: string | null; difficulty: string | number | null }>
        | { type_code: string | null; difficulty: string | number | null } | null;
    }>;
    for (const r of rows) {
      const c = Array.isArray(r.classifications) ? r.classifications[0] : r.classifications;
      if (!c?.type_code) continue;
      const unit = unitOf(c.type_code);
      const band = bandOf(c.difficulty, scheme);
      if (!unit || !band) continue;
      const rec = supply.get(unit) ?? {};
      rec[band] = (rec[band] ?? 0) + 1;
      supply.set(unit, rec);
    }
    if (rows.length < PAGE) break;
  }
  return supply;
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

  const { data: cRows } = await sb
    .from('courses')
    .select('id, title, subject_code, settings, created_at')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const courses = (cRows ?? []) as Array<{
    id: string; title: string; subject_code: string; settings: Record<string, unknown> | null; created_at: string;
  }>;
  if (courses.length === 0) return NextResponse.json({ courses: [] });

  const { data: sRows } = await sb
    .from('course_steps')
    .select('id, course_id, seq, unit_code, unit_round, label, rung_label, level_plan, short, assignment_id, issued_at')
    .in('course_id', courses.map((c) => c.id))
    .order('seq');
  const steps = (sRows ?? []) as Array<{
    id: string; course_id: string; seq: number; unit_code: string; unit_round: number; label: string; rung_label: string | null;
    level_plan: Record<string, number>; short: boolean; assignment_id: string | null; issued_at: string | null;
  }>;

  // 이름
  const unitCodes = Array.from(new Set(steps.map((s) => s.unit_code)));
  const unitName = new Map<string, string>();
  for (let i = 0; i < unitCodes.length; i += 200) {
    const { data } = await sb.from('mathsecr_types').select('code, level3_name').in('code', unitCodes.slice(i, i + 200));
    for (const r of (data ?? []) as Array<{ code: string; level3_name: string | null }>) unitName.set(r.code, r.level3_name || r.code);
  }
  const subjCodes = Array.from(new Set(courses.map((c) => c.subject_code)));
  const { data: subjRows } = await sb.from('mathsecr_types').select('code, subject_name').in('code', subjCodes);
  const subjName = new Map(((subjRows ?? []) as Array<{ code: string; subject_name: string | null }>).map((r) => [r.code, r.subject_name ?? r.code]));

  // 회차 과제 — course_step_id 로 찾는다 (공통: 회차당 1개 · 개인화: 학생마다 1개). 오답유사(parent 있음)는 따로 센다.
  const stepIds = steps.map((s) => s.id);
  type StepAsg = {
    id: string; course_step_id: string; exam_id: string | null; due_at: string | null;
    parent_assignment_id: string | null; assignment_students: Array<{ student_id: string }> | null;
  };
  const stepAsgs: StepAsg[] = [];
  for (let i = 0; i < stepIds.length; i += 200) {
    const { data } = await sb
      .from('assignments')
      .select('id, course_step_id, exam_id, due_at, parent_assignment_id, assignment_students(student_id)')
      .in('course_step_id', stepIds.slice(i, i + 200))
      .is('deleted_at', null);
    stepAsgs.push(...((data ?? []) as StepAsg[]));
  }
  const asgsByStep = new Map<string, StepAsg[]>();
  const wrongMade = new Map<string, number>();
  const wrongExamsByStep = new Map<string, Array<{ studentId: string | null; examId: string }>>();
  for (const a of stepAsgs) {
    if (a.parent_assignment_id) {
      wrongMade.set(a.course_step_id, (wrongMade.get(a.course_step_id) ?? 0) + (a.assignment_students?.length ?? 0));
      if (a.exam_id) {
        const arr = wrongExamsByStep.get(a.course_step_id) ?? [];
        arr.push({ studentId: a.assignment_students?.length === 1 ? a.assignment_students[0].student_id : null, examId: a.exam_id });
        wrongExamsByStep.set(a.course_step_id, arr);
      }
      continue;
    }
    const arr = asgsByStep.get(a.course_step_id) ?? [];
    arr.push(a);
    asgsByStep.set(a.course_step_id, arr);
  }
  const examIds = Array.from(new Set(
    stepAsgs.filter((a) => !a.parent_assignment_id && a.exam_id).map((a) => a.exam_id as string)
  ));

  // 제출 — 채점 세션 (반 학생 + 신원 병합)
  const roster = await resolveClassStudents(sb, classId);
  type Sess = { id: string; student_id: string; exam_id: string; completed_at: string | null };
  const sessions: Sess[] = [];
  if (examIds.length > 0 && roster.allRefs.length > 0) {
    const { data } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id, student_id, exam_id, completed_at')
      .in('exam_id', examIds)
      .in('student_id', roster.allRefs);
    sessions.push(...((data ?? []) as Sess[]));
  }
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
  // (exam, owner) → 채점된 세션
  const doneByExam = new Map<string, Map<string, { graded: number; correct: number }>>();
  for (const s of sessions) {
    const sc = score.get(s.id);
    if (!sc || sc.graded === 0) continue;
    const owner = roster.ownerByRef.get(s.student_id);
    if (!owner) continue;
    const m = doneByExam.get(s.exam_id) ?? new Map<string, { graded: number; correct: number }>();
    const prev = m.get(owner);
    if (!prev || sc.graded > prev.graded) m.set(owner, sc);
    doneByExam.set(s.exam_id, m);
  }

  const out: CourseRow[] = courses.map((c) => {
    const settingsRaw = c.settings ?? {};
    const ladder = parseLadder(settingsRaw.ladder) ?? [...DEFAULT_LADDER];
    const st = steps.filter((s) => s.course_id === c.id);
    const done = new Map<string, number>(roster.studentIds.map((id) => [id, 0]));
    const rows: CourseStepRow[] = st.map((s) => {
      const asgs = asgsByStep.get(s.id) ?? [];
      const personal = asgs.length > 1 || (asgs.length === 1 && (asgs[0].assignment_students?.length ?? 0) === 1 && roster.studentIds.length > 1);
      let submitted = 0; let g = 0; let cor = 0; let eligible = 0;
      const counted = new Set<string>();
      const exams: Array<{ studentId: string | null; examId: string }> = [];
      for (const a of asgs) {
        if (!a.exam_id) continue;
        const targets = new Set((a.assignment_students ?? []).map((x) => x.student_id));
        exams.push({ studentId: targets.size === 1 ? Array.from(targets)[0] : null, examId: a.exam_id });
        const m = doneByExam.get(a.exam_id);
        if (!m) continue;
        for (const [sid, sc] of m) {
          if (!done.has(sid) || counted.has(sid)) continue;
          if (targets.size > 0 && !targets.has(sid)) continue;   // 개인화: 남의 시험지 세션은 안 센다
          counted.add(sid);
          submitted += 1; g += sc.graded; cor += sc.correct;
          if (sc.graded > sc.correct) eligible += 1;
          done.set(sid, (done.get(sid) ?? 0) + 1);
        }
      }
      const first = asgs[0];
      const plan = s.level_plan ?? {};
      return {
        id: s.id, seq: s.seq, unit: s.unit_code, unitName: unitName.get(s.unit_code) ?? s.unit_code,
        unitRound: s.unit_round, label: s.label,
        rungLabel: s.rung_label || '',
        levelPlan: plan,
        total: Object.values(plan).reduce((n, x) => n + Number(x || 0), 0),
        short: s.short,
        assignmentId: first?.id ?? s.assignment_id ?? null,
        examId: !personal && first?.exam_id ? first.exam_id : null,
        exams, personal,
        wrongExams: wrongExamsByStep.get(s.id) ?? [],
        issuedAt: s.issued_at ?? (first ? '' : null),
        dueAt: first?.due_at ?? null,
        submitted, avgPct: g > 0 ? Math.round((cor * 100) / g) : null,
        wrongSimilar: { made: wrongMade.get(s.id) ?? 0, eligible },
      };
    });
    const progress = roster.studentIds.map((sid) => ({
      studentId: sid, name: displayName(roster.userById.get(sid)), done: done.get(sid) ?? 0,
    }));
    const total = rows.length;
    const avg = total > 0 && progress.length > 0
      ? Math.round(progress.reduce((n, p) => n + p.done, 0) * 100 / (total * progress.length)) : null;
    const range = settingsRaw.range as { l1?: string[] } | undefined;
    return {
      id: c.id, title: c.title, subjectCode: c.subject_code, subjectName: subjName.get(c.subject_code) ?? c.subject_code,
      settings: {
        issueMode: settingsRaw.issueMode === 'personal' ? 'personal' : 'common',
        perStep: Number(settingsRaw.perStep) || 10,
        ladder,
        range,
      },
      createdAt: c.created_at, steps: rows, issued: rows.filter((r) => r.issuedAt != null).length,
      progress, avgProgressPct: avg,
    };
  });
  return NextResponse.json({ courses: out });
}

// ============================================================================
// POST — { subjectCode, title?, l1?: string[], perStep?, ladder?, issueMode?, preview?: boolean }
// ============================================================================
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope, user } = authed.data;
  const guard = await guardClass(classId, scope);
  if (!guard.ok) return guard.res;

  let body: {
    subjectCode?: unknown; title?: unknown; l1?: unknown; perStep?: unknown;
    ladder?: unknown; issueMode?: unknown; preview?: unknown;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const subject = typeof body.subjectCode === 'string' ? body.subjectCode.trim() : '';
  if (!/^MS\d{2}$/.test(subject)) return NextResponse.json({ error: '과정(과목 코드)을 고르세요' }, { status: 400 });
  const l1 = Array.isArray(body.l1) ? (body.l1 as unknown[]).map(String).filter((c) => /^MS\d{2}-\d{2}$/.test(c)) : [];
  const perStep = Math.min(30, Math.max(3, Math.round(Number(body.perStep) || 10)));
  const ladder = parseLadder(body.ladder) ?? [...DEFAULT_LADDER];
  const issueMode = body.issueMode === 'personal' ? 'personal' : 'common';
  const preview = body.preview === true;

  const { data: subjRow } = await sb.from('mathsecr_types').select('subject_name').eq('code', subject).maybeSingle();
  const subjectName = (subjRow as { subject_name: string | null } | null)?.subject_name ?? subject;

  const units = await loadUnits(subject, l1);
  if (units.length === 0) return NextResponse.json({ error: '범위에 소단원이 없습니다' }, { status: 400 });
  const supply = await loadSupply(subject, scope, 4);
  const unitSupply: UnitSupply[] = units.map((u) => ({ unit: u.code, name: u.name, supply: supply.get(u.code) ?? {} }));
  const planned = planSteps(unitSupply, { perStep, ladder });
  const summary = summarizePlan(unitSupply, planned);
  const emptyUnits = unitSupply.filter((u) => summary.unitsEmpty.includes(u.unit)).map((u) => ({ unit: u.unit, name: u.name }));

  if (preview) {
    return NextResponse.json({ preview: true, subjectName, steps: planned, summary, emptyUnits });
  }
  if (planned.length === 0) {
    return NextResponse.json({ error: '이 범위엔 분류된 문제가 없어 회차를 만들 수 없습니다' }, { status: 400 });
  }

  const title = (typeof body.title === 'string' && body.title.trim()) || `${subjectName} 코스`;
  const { data: created, error: cErr } = await sb
    .from('courses')
    .insert({
      class_id: classId, institute_id: guard.cls.institute_id, subject_code: subject, title,
      settings: { issueMode, perStep, ladder, range: { l1 } },
      created_by: user.id,
    })
    .select('id')
    .single();
  if (cErr || !created) return NextResponse.json({ error: `코스 생성 실패: ${cErr?.message ?? 'unknown'}` }, { status: 500 });
  const courseId = (created as { id: string }).id;

  const rows = planned.map((s) => ({
    course_id: courseId, seq: s.seq, unit_code: s.unit, unit_round: s.unitRound,
    label: s.label, rung_label: s.rungLabel, level_plan: s.levelPlan, short: s.short,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('course_steps').insert(rows.slice(i, i + 500));
    if (error) {
      await sb.from('courses').delete().eq('id', courseId);   // 되돌린다 — 회차 없는 코스 금지
      return NextResponse.json({ error: `회차 저장 실패: ${error.message}` }, { status: 500 });
    }
  }
  return NextResponse.json({ courseId, title, steps: planned.length, summary, emptyUnits }, { status: 201 });
}
