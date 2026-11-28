// ============================================================================
// POST /api/session-results/from-student
//   학생이 QR 로 진입한 /answer/[session_id] 페이지에서 일괄 제출한 답을
//   자동 채점하여 diagnostics.session_results 에 upsert.
//
// body:
//   {
//     session_id: string (uuid),
//     answers: [
//       { sequence_number: number, student_answer: string }
//       ...
//     ]
//   }
//
// 자동 채점 모드:
//   - objective : ①~⑤ normalize 후 비교
//   - numeric   : 정수/소수/분수 normalize 후 비교
//   - manual    : 서답형 — is_correct=false 로 저장하되 teacher_note 에
//                 "[학생답: ...] [자동채점 보류]" 기록 → 강사 확인용
//
// 반환:
//   { saved, auto_correct, auto_wrong, needs_review: [{ seq, student_answer, correct }] }
//
// 인증 (2026-11-27 보강):
//   예전엔 「세션 UUID 는 추측 불가」라며 인증이 없었다. 이제 로그인 필수 —
//   학생은 본인 세션만(승격 전 명단 id 포함), 선생님은 자기 학원 학생 세션만.
//   채점·저장 본체는 lib/grading/save-student-answers (태블릿 풀이와 공용).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';
import { loadOwnSession } from '@/lib/student/own-session';
import { saveStudentAnswers, type StudentAnswerInput } from '@/lib/grading/save-student-answers';

export const dynamic = 'force-dynamic';

interface RequestBody {
  session_id?: string;
  answers?: StudentAnswerInput[];
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sessionId = body.session_id;
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (answers.length === 0) return NextResponse.json({ error: 'answers 배열 필요' }, { status: 400 });

  let session: { id: string; student_id: string | null; exam_id: string | null };
  if (user.role === 'STUDENT') {
    const own = await loadOwnSession(sb, user.id, sessionId);
    if (!own.ok) return NextResponse.json({ error: own.error }, { status: own.status });
    session = own.session;
  } else {
    const { data, error: sErr } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id, student_id, exam_id')
      .eq('id', sessionId)
      .single();
    if (sErr || !data) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    session = data as { id: string; student_id: string | null; exam_id: string | null };
    if (session.student_id) {
      const g = await assertStudentAccess(sb, session.student_id, scope);
      if (!g.ok) return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: g.status });
    }
  }

  const r = await saveStudentAnswers(sb, session, answers);
  if (!r.ok) {
    console.error('[session-results/from-student] 저장 실패:', r.error);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  const { saved, auto_correct, auto_wrong, needs_review, errors } = r.result;
  return NextResponse.json(
    { saved, auto_correct, auto_wrong, needs_review, errors },
    { status: saved === 0 && errors.length > 0 ? 400 : 200 },
  );
}
