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
    if (b.max_completion_tokens === undefined) {
      // ★ 추론 모델은 "생각 토큰"이 같은 한도에서 빠진다 — gpt-4o 시절 한도(2000 등)를 그대로 쓰면 JSON 이 잘릴 수 있다.
      //   실측(2026-10-06, gpt-5.5 bbox JSON): 추론 93~107 토큰 — 보통은 작지만 이미지·긴 입력에서 커질 수 있어 4배(최소 4000, 최대 16000)로.
      const mt = Number(b.max_tokens) || 0;
      b.max_completion_tokens = Math.min(16000, Math.max(4000, mt * 4));
    }
    delete b.max_tokens;
  }
  // ★ 분류·감지·추출 같은 "정해진 꼴 답" 작업은 깊은 추론이 필요 없다 — 미지정이면 low (실측: 8.3s → 4.1s, 결과 동일)
  if (b.reasoning_effort === undefined) b.reasoning_effort = 'low';
  if (b.temperature !== undefined && b.temperature !== 1) delete b.temperature;
  if (b.top_p !== undefined) delete b.top_p;
  return body;
}
