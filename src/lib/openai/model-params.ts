// ============================================================================
// OpenAI 모델 상수 + chat/completions 본문 정규화
// ============================================================================
//
// ★ 실측 (2026-10-06, /v1/chat/completions 직접 호출) — gpt-5.x:
//   - `max_tokens` → 400 "Use 'max_completion_tokens' instead"
//   - `temperature: 0.2` → 400 "Only the default (1) value is supported"
//   - 되는 것: `max_completion_tokens`, `reasoning_effort`, `response_format: json_object`, 이미지 입력(image_url)
//   gpt-4o/4.1 은 종전 꼴 그대로. → 호출부는 종전 꼴로 써도 되고 보내기 직전 `normalizeOpenAIBody` 가 바꾼다.

export const OPENAI_MODELS = {
  /** 비전·분류·풀이 폴백 — 종전 gpt-4o 자리 */
  MAIN: 'gpt-5.5',
  /** 가벼운 분류·요약 — 종전 gpt-4o-mini / gpt-4.1-mini 자리 */
  MINI: 'gpt-5.4-mini',
} as const;

/** gpt-5 계열·o 계열 = 추론 모델 (max_completion_tokens, temperature 고정) */
export function isReasoningModel(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.trim().toLowerCase();
  return /^gpt-[5-9]/.test(m) || /^o[1-9]/.test(m);
}

export function normalizeOpenAIBody<T extends Record<string, unknown>>(body: T): T {
  const b = body as Record<string, unknown>;
  if (!isReasoningModel(typeof b.model === 'string' ? b.model : '')) return body;
  if (b.max_tokens !== undefined) {
    if (b.max_completion_tokens === undefined) b.max_completion_tokens = b.max_tokens;
    delete b.max_tokens;
  }
  if (b.temperature !== undefined && b.temperature !== 1) delete b.temperature;
  if (b.top_p !== undefined) delete b.top_p;
  return body;
}
