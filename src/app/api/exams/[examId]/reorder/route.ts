// ============================================================================
// PATCH /api/exams/[examId]/reorder
//   드래그앤드롭으로 바뀐 문제 순서를 DB에 반영.
//   body: { orderedProblemIds: string[] } — 새 순서대로 나열된 problem_id 배열
//   → exam_problems.sequence_number 를 1부터 순차 부여.
//
// 안전
//   - exam_id 일치 여부 체크 (해당 시험지의 문제만 업데이트)
//   - orderedProblemIds 배열 길이가 기존 수와 같아야 함
//   - 임시 큰 값(오프셋)으로 먼저 갱신해 UNIQUE(exam_id, sequence_number) 충돌 회피
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  let body: { orderedProblemIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ordered = Array.isArray(body.orderedProblemIds) ? body.orderedProblemIds : null;
  if (!ordered || ordered.length === 0) {
    return NextResponse.json({ error: 'orderedProblemIds 배열 필요' }, { status: 400 });
  }
  if (!ordered.every((v) => typeof v === 'string')) {
    return NextResponse.json({ error: 'orderedProblemIds 요소는 모두 문자열이어야 합니다' }, { status: 400 });
  }
  const orderedIds = ordered as string[];

  // 1) 현재 exam_problems 조회 — 배열 길이/소속 검증
  const { data: currentRows, error: selErr } = await sb
    .from('exam_problems')
    .select('problem_id')
    .eq('exam_id', examId);

  if (selErr) {
    console.error('[reorder] select error:', selErr.message);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const currentIds = new Set((currentRows || []).map((r: any) => r.problem_id as string));
  if (currentIds.size !== orderedIds.length) {
    return NextResponse.json({
      error: `문제 수 불일치 (DB=${currentIds.size}, 요청=${orderedIds.length})`,
    }, { status: 400 });
  }
  for (const id of orderedIds) {
    if (!currentIds.has(id)) {
      return NextResponse.json({ error: `해당 시험지에 없는 problem_id: ${id}` }, { status: 400 });
    }
  }

  // 2) 2-phase 업데이트 — sequence_number UNIQUE 제약 회피
  //    Phase A: 모든 행을 큰 오프셋으로 이동 (10000+)
  //    Phase B: 새 순서대로 1부터 부여
  const OFFSET = 10000;
  const errors: string[] = [];

  // Phase A
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from('exam_problems')
      .update({ sequence_number: OFFSET + i })
      .eq('exam_id', examId)
      .eq('problem_id', orderedIds[i]);
    if (error) errors.push(`A/${i}:${error.message}`);
  }

  // Phase B
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from('exam_problems')
      .update({ sequence_number: i + 1 })
      .eq('exam_id', examId)
      .eq('problem_id', orderedIds[i]);
    if (error) errors.push(`B/${i}:${error.message}`);
  }

  if (errors.length > 0) {
    console.error('[reorder] update errors:', errors);
    return NextResponse.json({ error: errors.slice(0, 5).join('; '), partialErrors: errors.length }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: orderedIds.length });
}
