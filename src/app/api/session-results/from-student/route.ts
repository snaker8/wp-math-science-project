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
// 인증:
//   학생용 QR 진입 경로 — 본인 인증은 세션의 student_id 가 박혀 있으므로 별도 X.
//   세션 ID 자체가 무작위 UUID → 추측 불가하면 충분히 안전.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { compareAnswer, type GradeMode } from '@/lib/grading/compare-answer';

export const dynamic = 'force-dynamic';

interface StudentAnswerEntry {
  sequence_number?: number;
  student_answer?: string;
}

interface RequestBody {
  session_id?: string;
  answers?: StudentAnswerEntry[];
}

interface ReviewItem {
  seq: number;
  student_answer: string;
  correct: string;
  mode: GradeMode;
}

export async function POST(request: NextRequest) {
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

  // 세션 + 학생/시험지 snapshot
  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }
  const studentId = (session as { student_id?: string }).student_id || null;
  const examId = (session as { exam_id?: string }).exam_id || null;

  // session_problems → sequence_number ↔ problem_id
  const { data: sp } = await sb
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('sequence_number, problem_id')
    .eq('session_id', sessionId);

  const seqToProblem = new Map<number, string>();
  for (const r of (sp || []) as Array<{ sequence_number: number; problem_id: string }>) {
    seqToProblem.set(r.sequence_number, r.problem_id);
  }

  // problems 일괄 조회 → answer_json
  const problemIds = Array.from(new Set(Array.from(seqToProblem.values())));
  const { data: problems } = problemIds.length > 0
    ? await sb.from('problems').select('id, answer_json').in('id', problemIds)
    : { data: [] as Array<{ id: string; answer_json: Record<string, unknown> | null }> };

  const problemMap = new Map<string, Record<string, unknown> | null>();
  for (const p of (problems || []) as Array<{ id: string; answer_json: Record<string, unknown> | null }>) {
    problemMap.set(p.id, p.answer_json || null);
  }

  // 비교 + row 조립
  const rows: Array<Record<string, unknown>> = [];
  const needsReview: ReviewItem[] = [];
  const errors: string[] = [];
  let autoCorrect = 0;
  let autoWrong = 0;

  for (const a of answers) {
    const seq = Number(a.sequence_number);
    const studentAnswer = (a.student_answer ?? '').trim();
    if (!Number.isInteger(seq) || seq <= 0) {
      errors.push(`잘못된 sequence_number: ${a.sequence_number}`);
      continue;
    }
    if (!studentAnswer) {
      // 학생이 비워둔 문항 — 결과 row 자체 안 만듦 (강사가 /grade 에서 따로 처리)
      continue;
    }

    const problemId = seqToProblem.get(seq);
    if (!problemId) {
      errors.push(`seq=${seq}: session_problems 에 없음`);
      continue;
    }

    const outcome = compareAnswer(studentAnswer, problemMap.get(problemId) || null);

    // 저장값 결정
    let isCorrect: boolean;
    let teacherNote: string;
    if (outcome.isCorrect === null) {
      // 자동채점 보류 — 일단 오답으로 박되 강사 확인용 메모 + needsReview 응답
      isCorrect = false;
      teacherNote = `[학생답: ${studentAnswer}] [자동채점 보류 · ${outcome.mode}]`;
      needsReview.push({
        seq,
        student_answer: studentAnswer,
        correct: outcome.normalizedCorrect,
        mode: outcome.mode,
      });
    } else {
      isCorrect = outcome.isCorrect;
      if (isCorrect) autoCorrect += 1;
      else autoWrong += 1;
      teacherNote = `[학생답: ${outcome.normalizedStudent || studentAnswer}]`;
    }

    rows.push({
      session_id: sessionId,
      problem_id: problemId,
      sequence_number: seq,
      is_correct: isCorrect,
      error_cause: null,
      teacher_note: teacherNote,
      graded_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { saved: 0, auto_correct: 0, auto_wrong: 0, needs_review: needsReview, errors },
      { status: errors.length > 0 ? 400 : 200 },
    );
  }

  const { error: upErr, count } = await sb
    .schema('diagnostics' as never)
    .from('session_results')
    .upsert(rows, { onConflict: 'session_id,sequence_number', count: 'exact' });

  if (upErr) {
    console.error('[session-results/from-student] upsert error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Phase C-2: 오답 problem_pitfalls 매칭 → student_pitfall_history INSERT
  // (POST /api/session-results 와 동일한 패턴 — 학생 함정 누적 base)
  if (studentId) {
    try {
      const wrongProblemIds = rows
        .filter((r) => r.is_correct === false)
        .map((r) => r.problem_id as string);

      if (wrongProblemIds.length > 0) {
        const { data: pitfallRows } = await sb
          .from('problem_pitfalls')
          .select('problem_id, pitfall_code')
          .in('problem_id', wrongProblemIds);

        if (pitfallRows && pitfallRows.length > 0) {
          const historyRows = (pitfallRows as Array<{ problem_id: string; pitfall_code: string }>).map((p) => ({
            student_id: studentId,
            pitfall_code: p.pitfall_code,
            problem_id: p.problem_id,
            session_id: sessionId,
            exam_id: examId,
          }));
          const { error: histErr } = await sb
            .schema('diagnostics' as never)
            .from('student_pitfall_history')
            .insert(historyRows);
          if (histErr) {
            console.warn('[from-student] pitfall_history insert 실패:', histErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('[from-student] pitfall_history 예외:', e);
    }
  }

  return NextResponse.json({
    saved: count ?? rows.length,
    auto_correct: autoCorrect,
    auto_wrong: autoWrong,
    needs_review: needsReview,
    errors,
  });
}
