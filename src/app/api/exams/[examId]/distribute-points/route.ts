// ============================================================================
// POST /api/exams/[examId]/distribute-points
//   난이도 기반 배점 자동 분배 — 총점 100점 (기본) 또는 지정한 총점으로
//   body: { total?: number } — 기본 100
//   단답형/서술형은 객관식보다 조금 더 배점
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const body = await request.json().catch(() => ({}));
    const total = typeof body.total === 'number' && body.total > 0 ? body.total : 100;

    // exam_problems + problems 조회 (난이도 + 서술형 여부 필요)
    const { data: eps, error: epErr } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number', { ascending: true });
    if (epErr) throw epErr;
    const rows = eps || [];
    if (rows.length === 0) return NextResponse.json({ error: '시험지에 문제가 없습니다' }, { status: 400 });

    const pIds = rows.map((r: any) => r.problem_id);
    const [{ data: problemsData }, { data: classData }] = await Promise.all([
      supabaseAdmin.from('problems').select('id, answer_json').in('id', pIds),
      supabaseAdmin.from('classifications').select('problem_id, difficulty').in('problem_id', pIds),
    ]);

    const problemMap = new Map((problemsData || []).map((p: any) => [p.id, p]));
    const difficultyMap = new Map((classData || []).map((c: any) => [c.problem_id, parseInt(c.difficulty, 10) || 3]));

    // 각 문제의 가중치 계산 — 난이도(1~10) + 서술형 보너스
    const weights = rows.map((r: any) => {
      const prob = problemMap.get(r.problem_id);
      const aj = (prob?.answer_json || {}) as Record<string, unknown>;
      const isSubjective = !Array.isArray(aj.choices) || (aj.choices as unknown[]).length === 0;
      const diff = difficultyMap.get(r.problem_id) || 3;
      // 난이도 1→1.0, 5→2.0, 10→3.0 (대략 선형)
      // 서술형은 ×1.3
      const base = 0.8 + diff * 0.22;
      return isSubjective ? base * 1.3 : base;
    });

    const weightSum = weights.reduce((a: number, b: number) => a + b, 0);
    if (weightSum <= 0) return NextResponse.json({ error: '가중치 계산 실패' }, { status: 500 });

    // 비례 분배 후 반올림 (각 문제 최소 1점), 총합 맞추기 위해 잔여는 가중치 큰 순서로 ±1 조정
    const raw = weights.map((w: number) => (w / weightSum) * total);
    const rounded = raw.map((v: number) => Math.max(1, Math.round(v)));
    let diff = total - rounded.reduce((a: number, b: number) => a + b, 0);
    // 가중치 큰 순으로 인덱스 정렬
    const order = weights
      .map((w: number, i: number) => ({ w, i }))
      .sort((a: { w: number; i: number }, b: { w: number; i: number }) => b.w - a.w)
      .map((x: { w: number; i: number }) => x.i);
    let cursor = 0;
    while (diff !== 0 && cursor < order.length * 10) {
      const idx = order[cursor % order.length];
      if (diff > 0) {
        rounded[idx]++;
        diff--;
      } else if (rounded[idx] > 1) {
        rounded[idx]--;
        diff++;
      }
      cursor++;
    }

    // 일괄 UPDATE
    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const { error } = await supabaseAdmin
        .from('exam_problems')
        .update({ points: rounded[i] })
        .eq('exam_id', examId)
        .eq('problem_id', rows[i].problem_id);
      if (!error) updated++;
    }
    // 시험지 total_points 도 갱신
    await supabaseAdmin.from('exams').update({ total_points: rounded.reduce((a: number, b: number) => a + b, 0) }).eq('id', examId);

    return NextResponse.json({
      examId,
      total,
      count: rows.length,
      updated,
      points: rows.map((r: any, i: number) => ({ sequence_number: r.sequence_number, points: rounded[i] })),
    });
  } catch (err) {
    console.error('[distribute-points] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/exams/[examId]/distribute-points
//   배점 초기화 — exam_problems.points → null, exams.total_points → null
// ============================================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { error: epErr, count } = await supabaseAdmin
      .from('exam_problems')
      .update({ points: null }, { count: 'exact' })
      .eq('exam_id', examId);
    if (epErr) throw epErr;

    await supabaseAdmin.from('exams').update({ total_points: null }).eq('id', examId);

    return NextResponse.json({ examId, cleared: count ?? 0 });
  } catch (err) {
    console.error('[distribute-points DELETE] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
