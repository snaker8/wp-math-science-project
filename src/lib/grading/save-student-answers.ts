// ============================================================================
// 학생이 직접 낸 답 → 자동 채점 → diagnostics.session_results upsert
// ----------------------------------------------------------------------------
// QR 답 입력(/answer/[id])과 태블릿·노트북 풀이(/student/solve/[id])가 같은 함수를 쓴다.
// 결과는 선생님 화면(반 허브·숙달·과제 현황·리포트)이 읽는 B라인(session_results) 그대로다.
//
// 자동 채점 모드 (compareAnswer):
//   - objective : ①~⑤ normalize 후 비교
//   - numeric   : 정수/소수/분수 normalize 후 비교
//   - manual    : 서답형 — is_correct=false 로 저장하되 teacher_note 에
//                 "[학생답: ...] [자동채점 보류]" 기록 → 강사 확인용 (점수 집계에서 빠진다)
//
// markBlankWrong: 「제출」로 끝낸 풀이는 빈 문항도 오답으로 남겨야 세션이 끝난다
//   (completed_at 은 모든 문항에 결과가 있을 때 트리거가 채운다).
//   QR 경로는 예전처럼 빈 문항을 건너뛴다(선생님이 /grade 에서 따로 처리).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { compareAnswer, type GradeMode } from '@/lib/grading/compare-answer';

export interface StudentAnswerInput {
  sequence_number?: number;
  student_answer?: string;
  /** 이 문항에 쓴 시간(초) — 태블릿 풀이에서만 온다 */
  time_taken_sec?: number;
}

export interface ReviewItem {
  seq: number;
  student_answer: string;
  correct: string;
  mode: GradeMode;
}

export interface SaveAnswersResult {
  saved: number;
  auto_correct: number;
  auto_wrong: number;
  blank: number;
  needs_review: ReviewItem[];
  errors: string[];
}

export const BLANK_NOTE = '[학생답: (미응답)]';

export async function saveStudentAnswers(
  sb: SupabaseClient,
  session: { id: string; student_id: string | null; exam_id: string | null },
  answers: StudentAnswerInput[],
  opts: { markBlankWrong?: boolean } = {},
): Promise<{ ok: true; result: SaveAnswersResult } | { ok: false; status: number; error: string }> {
  const sessionId = session.id;

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

  const problemIds = Array.from(new Set(Array.from(seqToProblem.values())));
  const { data: problems } = problemIds.length > 0
    ? await sb.from('problems').select('id, answer_json').in('id', problemIds)
    : { data: [] as Array<{ id: string; answer_json: Record<string, unknown> | null }> };
  const problemMap = new Map<string, Record<string, unknown> | null>();
  for (const p of (problems || []) as Array<{ id: string; answer_json: Record<string, unknown> | null }>) {
    problemMap.set(p.id, p.answer_json || null);
  }

  const rows: Array<Record<string, unknown>> = [];
  const needsReview: ReviewItem[] = [];
  const errors: string[] = [];
  let autoCorrect = 0;
  let autoWrong = 0;
  let blank = 0;
  const now = new Date().toISOString();
  const seen = new Set<number>();

  for (const a of answers) {
    const seq = Number(a.sequence_number);
    const studentAnswer = (a.student_answer ?? '').trim();
    if (!Number.isInteger(seq) || seq <= 0) {
      errors.push(`잘못된 sequence_number: ${a.sequence_number}`);
      continue;
    }
    const problemId = seqToProblem.get(seq);
    if (!problemId) {
      errors.push(`seq=${seq}: session_problems 에 없음`);
      continue;
    }
    const t = Number(a.time_taken_sec);
    const timeTaken = Number.isFinite(t) && t >= 0 ? Math.min(Math.round(t), 24 * 3600) : null;

    if (!studentAnswer) {
      if (!opts.markBlankWrong) continue; // QR 경로 — 선생님이 따로 처리
      blank += 1;
      seen.add(seq);
      rows.push({
        session_id: sessionId, problem_id: problemId, sequence_number: seq,
        is_correct: false, error_cause: null, teacher_note: BLANK_NOTE, graded_at: now,
        ...(timeTaken != null ? { time_taken_sec: timeTaken } : {}),
      });
      continue;
    }

    const outcome = compareAnswer(studentAnswer, problemMap.get(problemId) || null);
    let isCorrect: boolean;
    let teacherNote: string;
    if (outcome.isCorrect === null) {
      isCorrect = false;
      teacherNote = `[학생답: ${studentAnswer}] [자동채점 보류 · ${outcome.mode}]`;
      needsReview.push({ seq, student_answer: studentAnswer, correct: outcome.normalizedCorrect, mode: outcome.mode });
    } else {
      isCorrect = outcome.isCorrect;
      if (isCorrect) autoCorrect += 1;
      else autoWrong += 1;
      teacherNote = `[학생답: ${outcome.normalizedStudent || studentAnswer}]`;
    }
    seen.add(seq);
    rows.push({
      session_id: sessionId, problem_id: problemId, sequence_number: seq,
      is_correct: isCorrect, error_cause: null, teacher_note: teacherNote, graded_at: now,
      ...(timeTaken != null ? { time_taken_sec: timeTaken } : {}),
    });
  }

  // 제출 경로: 답 목록에 아예 안 온 문항도 미응답으로 닫는다
  if (opts.markBlankWrong) {
    for (const [seq, problemId] of Array.from(seqToProblem.entries())) {
      if (seen.has(seq)) continue;
      blank += 1;
      rows.push({
        session_id: sessionId, problem_id: problemId, sequence_number: seq,
        is_correct: false, error_cause: null, teacher_note: BLANK_NOTE, graded_at: now,
      });
    }
  }

  const empty: SaveAnswersResult = { saved: 0, auto_correct: 0, auto_wrong: 0, blank: 0, needs_review: needsReview, errors };
  if (rows.length === 0) return { ok: true, result: empty };

  const { error: upErr, count } = await sb
    .schema('diagnostics' as never)
    .from('session_results')
    .upsert(rows, { onConflict: 'session_id,sequence_number', count: 'exact' });
  if (upErr) return { ok: false, status: 500, error: upErr.message };

  // 오답 problem_pitfalls 매칭 → student_pitfall_history (POST /api/session-results 와 같은 패턴)
  if (session.student_id) {
    try {
      const wrongProblemIds = rows.filter((r) => r.is_correct === false).map((r) => r.problem_id as string);
      if (wrongProblemIds.length > 0) {
        const { data: pitfallRows } = await sb
          .from('problem_pitfalls')
          .select('problem_id, pitfall_code')
          .in('problem_id', wrongProblemIds);
        if (pitfallRows && pitfallRows.length > 0) {
          const historyRows = (pitfallRows as Array<{ problem_id: string; pitfall_code: string }>).map((p) => ({
            student_id: session.student_id,
            pitfall_code: p.pitfall_code,
            problem_id: p.problem_id,
            session_id: sessionId,
            exam_id: session.exam_id,
          }));
          const { error: histErr } = await sb
            .schema('diagnostics' as never)
            .from('student_pitfall_history')
            .insert(historyRows);
          if (histErr) console.warn('[saveStudentAnswers] pitfall_history insert 실패:', histErr.message);
        }
      }
    } catch (e) {
      console.warn('[saveStudentAnswers] pitfall_history 예외:', e);
    }
  }

  return {
    ok: true,
    result: { saved: count ?? rows.length, auto_correct: autoCorrect, auto_wrong: autoWrong, blank, needs_review: needsReview, errors },
  };
}
