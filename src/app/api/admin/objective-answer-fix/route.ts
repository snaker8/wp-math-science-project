// ============================================================================
// PATCH /api/admin/objective-answer-fix
// 객관식 박힌 정답 일괄 수정 — { problemId, answer: '①'|'②'|'③'|'④'|'⑤' }.
// answer_json.correct_answer / finalAnswer 만 갱신, 다른 필드 보존.
// 사용처: /admin/answer-fix 회복 도구.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VALID_CIRCLED = ['①', '②', '③', '④', '⑤'];

export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: { problemId?: string; answer?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { problemId, answer } = body;
  if (!problemId || typeof problemId !== 'string') {
    return NextResponse.json({ error: 'problemId required' }, { status: 400 });
  }
  if (!answer || !VALID_CIRCLED.includes(answer)) {
    return NextResponse.json(
      { error: `answer 는 ① ~ ⑤ 중 하나여야 합니다. 받은 값: ${JSON.stringify(answer)}` },
      { status: 400 }
    );
  }

  // 기존 answer_json 가져와서 correct_answer / finalAnswer 만 갱신
  const { data: existing, error: getErr } = await supabaseAdmin
    .from('problems')
    .select('answer_json')
    .eq('id', problemId)
    .maybeSingle();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'problem not found' }, { status: 404 });
  }

  const merged = {
    ...((existing.answer_json as Record<string, unknown>) || {}),
    correct_answer: answer,
    finalAnswer: answer,
    answer_user_edited: true,
    user_edited_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabaseAdmin
    .from('problems')
    .update({ answer_json: merged })
    .eq('id', problemId);

  if (updErr) {
    console.error('[admin/objective-answer-fix]', updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, problemId, answer });
}
