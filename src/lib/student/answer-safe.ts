// ============================================================================
// 학생에게 보내도 되는 answer_json — 정답을 빼고 「무엇으로 답하는지」만
// ----------------------------------------------------------------------------
// ★ 2026-11-27: /api/sessions/[id] 가 제출 전 학생에게 answer_json(정답)·solution 을 그대로
//   내려보내고 있었다(개발자 도구로 정답이 보임). 제출 전엔 이 모양만 보낸다.
// ============================================================================

export type InputMode = 'objective' | 'numeric' | 'manual';

/** 답 입력 방식 — 서버 compareAnswer 와 같은 룰 (정답 문자열을 보고 정하므로 서버에서만 계산) */
export function decideInputMode(answerJson: Record<string, unknown> | null | undefined): { mode: InputMode; choiceCount: number } {
  if (!answerJson) return { mode: 'manual', choiceCount: 0 };
  const choices = Array.isArray(answerJson.choices) ? (answerJson.choices as unknown[]) : [];
  const declaredType = (answerJson.type as string) || '';
  const correctRaw = String(answerJson.finalAnswer ?? answerJson.correct_answer ?? '').trim();
  if (declaredType === 'multiple_choice' || choices.length > 0 || /^[①②③④⑤]$/.test(correctRaw) || /^[1-5]$/.test(correctRaw)) {
    return { mode: 'objective', choiceCount: choices.length > 5 ? choices.length : 5 };
  }
  const c = correctRaw.replace(/\s/g, '');
  if (/^-?\d+(\.\d+)?$/.test(c) || /^-?\d+\/-?\d+$/.test(c)) return { mode: 'numeric', choiceCount: 0 };
  return { mode: 'manual', choiceCount: 0 };
}

/** 정답·풀이 관련 키를 뺀 answer_json + input_mode */
export function studentSafeAnswerJson(answerJson: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!answerJson) return null;
  const { mode, choiceCount } = decideInputMode(answerJson);
  const safe: Record<string, unknown> = { input_mode: mode, choice_count: choiceCount };
  for (const k of ['type', 'choices', 'choiceLayout', 'choiceHeaders', 'choiceImages']) {
    if (answerJson[k] !== undefined) safe[k] = answerJson[k];
  }
  // 서술형 소문제 — 번호·배점만 (답 제외)
  if (Array.isArray(answerJson.subQuestions)) {
    safe.subQuestions = (answerJson.subQuestions as Array<Record<string, unknown>>).map((q) => ({
      number: q.number, points: q.points ?? null,
    }));
  }
  return safe;
}

/** 정답 표시용 문자열 (채점 후에만) */
export function displayCorrectAnswer(answerJson: Record<string, unknown> | null | undefined): string {
  if (!answerJson) return '';
  const v = answerJson.finalAnswer ?? answerJson.correct_answer ?? answerJson.answer ?? '';
  return String(v ?? '').trim();
}
