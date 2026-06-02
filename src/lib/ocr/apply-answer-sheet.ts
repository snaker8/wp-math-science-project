// ============================================================================
// 빠른답(정답표) 파일 → 답 추출 → 문제 seq 매칭 → answer_json 적용 (공용)
//
// match-answers 라우트(POST 추출 + PUT 적용)의 로직을 lib 로 공용화.
//   - 자산화 첫 모달(workflow/upload)에서 답안 파일 같이 올리면 자산화 직후 자동 적용.
//   - 추출 = extractAnswersWithGemini (answer-vision, PDF/이미지). 클라우드와 동일.
//   - 적용 = match-answers PUT 과 동일 안전 로직:
//       · 객관식(type='multiple_choice')은 ①~⑤ 만 신뢰 (normalizeObjectiveAnswer)
//         [[feedback_objective_answer_safety]] (CLAUDE.md 가드 #3)
//       · ①~⑤ 아닌 명백한 단답형이면 type→short_answer 보정 후 원본 보존
//       · 빈값/강등은 적용 안 함(기존 보존) — 자동 적용이라 절대 덮어쓰기·삭제 X
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractAnswersWithGemini } from './answer-vision';
import { normalizeObjectiveAnswer, isValidObjectiveAnswer } from '@/lib/validation/objective-answer';

export interface ApplyAnswerResult {
  parsed: number;          // 정답표에서 추출된 답 개수
  applied: number;         // 실제 답이 채워진 문제 수
  coercedToEmpty: number;  // 객관식 모호값 → 빈값 강등(미적용)
}

/**
 * 정답표 파일들에서 답을 추출해 시험지 문제(sequence_number 매칭)에 채운다.
 * 변화 없거나 빈값/강등은 적용 안 함(자동 적용이라 보수적).
 */
export async function applyQuickAnswerSheet(
  admin: SupabaseClient,
  examId: string,
  files: File[],
): Promise<ApplyAnswerResult> {
  // 1) 추출 — Gemini Vision (PDF/이미지). 첫 등장 우선.
  const answerMap = new Map<number, string>();
  for (const file of files) {
    try {
      const answers = await extractAnswersWithGemini(file);
      for (const a of answers) {
        if (a.answer && !answerMap.has(a.problemNumber)) answerMap.set(a.problemNumber, a.answer);
      }
    } catch (e) {
      console.warn(`[applyQuickAnswerSheet] 추출 실패 (${file.name}):`, e instanceof Error ? e.message : e);
    }
  }
  if (answerMap.size === 0) return { parsed: 0, applied: 0, coercedToEmpty: 0 };

  // 2) exam_problems — sequence_number → problem_id
  const { data: eps } = await admin
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number');
  const epRows = (eps || []) as Array<{ problem_id: string; sequence_number: number }>;
  if (epRows.length === 0) return { parsed: answerMap.size, applied: 0, coercedToEmpty: 0 };

  // 3) 현재 answer_json
  const { data: problems } = await admin
    .from('problems')
    .select('id, answer_json')
    .in('id', epRows.map((e) => e.problem_id));
  const pMap = new Map(
    ((problems || []) as Array<{ id: string; answer_json: Record<string, unknown> | null }>).map((p) => [p.id, p]),
  );

  // 4) seq 매칭 + 적용 (match-answers PUT 동일 안전 로직)
  let applied = 0;
  let coercedToEmpty = 0;
  const nowIso = new Date().toISOString();

  for (const ep of epRows) {
    const raw = answerMap.get(ep.sequence_number);
    if (!raw) continue;
    const p = pMap.get(ep.problem_id);
    if (!p) continue;

    const merged = { ...((p.answer_json || {}) as Record<string, unknown>) };
    const trimmed = raw.trim();
    const wasMC = merged.type === 'multiple_choice';

    let safeAns: string;
    if (wasMC && trimmed !== '' && !isValidObjectiveAnswer(trimmed)) {
      // 단답형 misclassification — type 보정 + 원본 보존
      merged.type = 'short_answer';
      safeAns = trimmed;
    } else if (wasMC) {
      safeAns = normalizeObjectiveAnswer(raw); // ①~⑤ 외엔 '' 강등
      if (trimmed !== '' && safeAns === '') { coercedToEmpty++; continue; } // 강등은 적용 X(기존 보존)
    } else {
      safeAns = raw; // 단답·서술 원본 보존
    }

    if (!safeAns) continue; // 빈값 적용 X
    const current = String(merged.finalAnswer || merged.correct_answer || '');
    if (current === safeAns) continue; // 변화 없음

    merged.finalAnswer = safeAns;
    merged.correct_answer = safeAns;
    merged.answer_user_edited = true; // 일괄 재생성이 안 건드리도록
    merged.uploaded_at = nowIso;

    const { error } = await admin.from('problems').update({ answer_json: merged }).eq('id', ep.problem_id);
    if (!error) applied++;
    else console.warn(`[applyQuickAnswerSheet] 적용 실패 ${ep.problem_id.slice(0, 8)}:`, error.message);
  }

  return { parsed: answerMap.size, applied, coercedToEmpty };
}
