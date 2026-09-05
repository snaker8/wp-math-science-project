// ============================================================================
// POST /api/classes/[classId]/courses/[courseId]/replan — 회차 다시 계획
// ----------------------------------------------------------------------------
// 문제은행이 자라면(분류가 붙으면) 안 낸 회차를 새 공급으로 다시 잡는다.
//   · 낸 회차는 그대로 둔다 (과제·채점이 붙어 있다).
//   · 안 낸 회차는 지우고, 소단원마다 「지금 공급 − 이미 낸 문제(밴드별)」로 계단을 다시 세운다.
//   · 회차 순서(seq)는 소단원 순 → 소단원 안에서 낸 회차 → 새 회차. unit_round 는 낸 회차 뒤로 이어 붙인다.
// body { perStep?: number, preview?: boolean }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { bandOf, unitOf } from '@/lib/class/mastery-bands';
import { DEFAULT_LADDER, planSteps, type UnitSupply } from '@/lib/class/course-ladder';
import { loadCourse, parseLadder } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; courseId: string }> }
const PAGE = 1000;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId, courseId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope } = authed.data;
  const g = await loadCourse(classId, courseId, scope);
  if (!g.ok) return g.res;
  const course = g.course;
  const settings = course.settings ?? {};

  let body: { perStep?: unknown; preview?: unknown } = {};
  try { body = await req.json(); } catch { /* 빈 body 허용 */ }
  const preview = body.preview === true;
  const perStep = Math.min(30, Math.max(3, Math.round(Number(body.perStep) || Number(settings.perStep) || 10)));
  const ladder = parseLadder(settings.ladder) ?? [...DEFAULT_LADDER];
  const subject = course.subject_code;
  const l1 = Array.isArray((settings.range as { l1?: unknown } | undefined)?.l1)
    ? ((settings.range as { l1: unknown[] }).l1).map(String) : [];

  // 1) 지금 회차
  const { data: sRows } = await sb
    .from('course_steps')
    .select('id, seq, unit_code, unit_round, assignment_id')
    .eq('course_id', courseId)
    .order('seq');
  const steps = (sRows ?? []) as Array<{ id: string; seq: number; unit_code: string; unit_round: number; assignment_id: string | null }>;
  const issued = steps.filter((s) => s.assignment_id);
  const pending = steps.filter((s) => !s.assignment_id);

  // 2) 소단원 목록 (범위)
  const units: Array<{ code: string; name: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await sb
      .from('mathsecr_types').select('code, level3_name')
      .like('code', `${subject}-%`).eq('depth', 4).order('code').range(from, from + PAGE - 1);
    const rows = (data ?? []) as Array<{ code: string; level3_name: string | null }>;
    for (const r of rows) {
      const l1code = r.code.split('-').slice(0, 2).join('-');
      if (l1.length > 0 && !l1.includes(l1code)) continue;
      units.push({ code: r.code, name: r.level3_name || r.code });
    }
    if (rows.length < PAGE) break;
  }

  // 3) 공급 (격리·트랙 통과) − 이미 낸 문제
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
      const unit = c?.type_code ? unitOf(c.type_code) : null;
      const band = bandOf(c?.difficulty, 4);
      if (!unit || !band) continue;
      const rec = supply.get(unit) ?? {};
      rec[band] = (rec[band] ?? 0) + 1;
      supply.set(unit, rec);
    }
    if (rows.length < PAGE) break;
  }
  if (issued.length > 0) {
    const { data: aRows } = await sb.from('assignments').select('exam_id').in('id', issued.map((s) => s.assignment_id!));
    const examIds = ((aRows ?? []) as Array<{ exam_id: string | null }>).map((a) => a.exam_id).filter((x): x is string => !!x);
    const pids: string[] = [];
    for (let i = 0; i < examIds.length; i += 200) {
      const { data } = await sb.from('exam_problems').select('problem_id').in('exam_id', examIds.slice(i, i + 200));
      for (const r of (data ?? []) as Array<{ problem_id: string }>) pids.push(r.problem_id);
    }
    for (let i = 0; i < pids.length; i += 200) {
      const { data } = await sb.from('classifications').select('type_code, difficulty').in('problem_id', pids.slice(i, i + 200));
      for (const c of (data ?? []) as Array<{ type_code: string | null; difficulty: string | number | null }>) {
        const unit = c.type_code ? unitOf(c.type_code) : null;
        const band = bandOf(c.difficulty, 4);
        if (!unit || !band) continue;
        const rec = supply.get(unit);
        if (rec && rec[band]) rec[band] = Math.max(0, rec[band] - 1);
      }
    }
  }

  // 4) 새 계단 — 소단원마다 낸 회차 수만큼 앞 단을 건너뛴다 (같은 단을 두 번 내지 않게)
  const issuedRounds = new Map<string, number>();
  for (const s of issued) issuedRounds.set(s.unit_code, Math.max(issuedRounds.get(s.unit_code) ?? 0, s.unit_round));
  const planned: Array<{ unit: string; unitName: string; unitRound: number; label: string; rungLabel: string; levelPlan: Record<string, number>; total: number; short: boolean }> = [];
  for (const u of units) {
    const skip = issuedRounds.get(u.code) ?? 0;
    const unitSupply: UnitSupply[] = [{ unit: u.code, name: u.name, supply: supply.get(u.code) ?? {} }];
    const steps = planSteps(unitSupply, { perStep, ladder: ladder.slice(skip) });
    for (const s of steps) {
      planned.push({ ...s, unitRound: skip + s.unitRound, label: `${skip + s.unitRound}회차` });
    }
  }

  // 5) 순서 — 소단원 순, 안에서 낸 회차 → 새 회차
  const unitOrder = new Map(units.map((u, i) => [u.code, i]));
  type Row = { kind: 'issued'; id: string; unit: string; unitRound: number } | { kind: 'new'; idx: number; unit: string; unitRound: number };
  const all: Row[] = [
    ...issued.map((s) => ({ kind: 'issued' as const, id: s.id, unit: s.unit_code, unitRound: s.unit_round })),
    ...planned.map((p, idx) => ({ kind: 'new' as const, idx, unit: p.unit, unitRound: p.unitRound })),
  ].sort((a, b) => (unitOrder.get(a.unit) ?? 9999) - (unitOrder.get(b.unit) ?? 9999) || a.unitRound - b.unitRound);

  const summary = {
    before: { issued: issued.length, pending: pending.length },
    after: { issued: issued.length, pending: planned.length, total: all.length },
    problems: planned.reduce((n, p) => n + p.total, 0),
    short: planned.filter((p) => p.short).length,
  };
  if (preview) return NextResponse.json({ preview: true, summary, steps: planned });

  // 6) 저장 — 안 낸 회차 삭제 → 낸 회차 seq 재부여(임시로 음수, 충돌 회피) → 새 회차 삽입
  if (pending.length > 0) {
    const { error } = await sb.from('course_steps').delete().in('id', pending.map((s) => s.id));
    if (error) return NextResponse.json({ error: `기존 회차 삭제 실패: ${error.message}` }, { status: 500 });
  }
  for (const [i, s] of issued.entries()) {
    await sb.from('course_steps').update({ seq: -(i + 1) }).eq('id', s.id);
  }
  const inserts: Array<Record<string, unknown>> = [];
  for (const [i, r] of all.entries()) {
    const seq = i + 1;
    if (r.kind === 'issued') {
      const { error } = await sb.from('course_steps').update({ seq }).eq('id', r.id);
      if (error) return NextResponse.json({ error: `회차 순서 갱신 실패: ${error.message}` }, { status: 500 });
    } else {
      const p = planned[r.idx];
      inserts.push({
        course_id: courseId, seq, unit_code: p.unit, unit_round: p.unitRound, label: p.label,
        rung_label: p.rungLabel, level_plan: p.levelPlan, short: p.short,
      });
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await sb.from('course_steps').insert(inserts.slice(i, i + 500));
    if (error) return NextResponse.json({ error: `새 회차 저장 실패: ${error.message}` }, { status: 500 });
  }
  if (Number(body.perStep) && Number(body.perStep) !== Number(settings.perStep)) {
    await sb.from('courses').update({ settings: { ...settings, perStep } }).eq('id', courseId);
  }
  return NextResponse.json({ ok: true, summary });
}
