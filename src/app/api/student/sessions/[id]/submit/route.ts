// ============================================================================
// POST /api/student/sessions/[id]/submit — 학생 풀이 제출 → 자동 채점
// ----------------------------------------------------------------------------
// body: { answers: [{ sequence_number, student_answer, time_taken_sec? }] }
// 빈 문항은 「미응답」 오답으로 닫는다 → 모든 문항에 결과가 생겨 세션이 완료된다
// (completed_at 은 트리거가 채운다). 결과는 선생님 화면이 읽는 session_results 그대로.
// 이미 완료된 세션은 다시 제출할 수 없다(다시 풀기는 별도 기능).
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { loadOwnSession } from '@/lib/student/own-session';
import { saveStudentAnswers, type StudentAnswerInput } from '@/lib/grading/save-student-answers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const own = await loadOwnSession(sb, user.id, params.id);
  if (!own.ok) return NextResponse.json({ error: own.error }, { status: own.status });
  if (own.session.completed_at) {
    return NextResponse.json({ error: '이미 제출한 과제입니다' }, { status: 409 });
  }

  let body: { answers?: StudentAnswerInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 500) : [];

  const r = await saveStudentAnswers(sb, own.session, answers, { markBlankWrong: true });
  if (!r.ok) {
    console.error('[student submit] 저장 실패:', r.error);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json(r.result);
}
