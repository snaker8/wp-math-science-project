// ============================================================================
// Anthropic 모델 상수 + 요청 본문 정규화 — 모델을 올릴 때 파라미터를 같이 손봐야 한다는 걸 잊어도 안전하도록
// ============================================================================
//
// ★ 사고 이력 (2026-08-30)
//   Opus 4.7 부터 `temperature` / `top_p` / `top_k` 가 **제거**됐다. 보내면 400 이다.
//   모델 문자열만 올리고 파라미터를 안 본 탓에 두 곳이 동시에 깨져 있었다.
//
// ★ 실측 (2026-10-06, /v1/messages 직접 호출) — Claude 5 계열(sonnet-5 · sonnet-5-5 · opus-5 · opus-5-5 · fable-5-x):
//   - `thinking: { type: 'enabled', budget_tokens }` → 400 "Use thinking.type.adaptive and output_config.effort"
//   - `temperature` → 400 "`temperature` is deprecated for this model"
//   - 되는 꼴: `thinking: { type: 'adaptive' }` + `output_config: { effort: 'low'|'medium'|'high' }`, temperature 없음
//   4.x(sonnet-4-6 · opus-4-6 이하)는 종전 꼴(enabled+budget, temperature) 그대로.
//   → 호출부는 종전 꼴로 써도 되고, 보내기 직전 `normalizeClaudeBody` 가 모델에 맞게 바꾼다.

/** 운영 기본 모델 — 한 곳에서 올린다 (2026-10-06 대표 「모든 모델 업그레이드」) */
export const CLAUDE_MODELS = {
  /** 본문 생성·해설·도형 SVG·재분석 — 균형 */
  SONNET: 'claude-sonnet-5-5',
  /** 어려운 해설 폴백·고급분석 「Opus」 */
  OPUS: 'claude-opus-5-5',
  /** 짧은 분류·요약 */
  HAIKU: 'claude-haiku-4-5',
} as const;

/** `temperature`/`top_p`/`top_k` 를 아직 허용하는 모델. 여기 없으면 보내지 않는다. */
const SAMPLING_PARAM_ALLOWLIST = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-opus-4-1',
  'claude-haiku-4-5',
  'claude-3',
];

/**
 * 이 모델에 temperature 류를 보내도 되는가.
 * 판단 못 하는 모델(빈 문자열·오타·신규)은 false — 빼고 보내는 쪽이 안전하다.
 */
export function acceptsSamplingParams(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.trim().toLowerCase();
  if (!m) return false;
  return SAMPLING_PARAM_ALLOWLIST.some(allowed => m === allowed || m.startsWith(`${allowed}-`));
}

/** Claude 5 이상 — adaptive thinking + effort, temperature 금지 */
export function usesAdaptiveThinking(model: string | undefined | null): boolean {
  if (!model) return false;
  return /^claude-(?:sonnet|opus|haiku|fable)-(?:[5-9]|\d{2})(?:[-.]|$)/.test(model.trim().toLowerCase());
}

export type ClaudeEffort = 'low' | 'medium' | 'high';

/** 종전 budget_tokens 를 effort 로 — 3000 미만 low · 8000 미만 medium · 그 이상 high */
export function effortFromBudget(budget: number | undefined): ClaudeEffort {
  if (!budget || budget < 3000) return 'low';
  if (budget < 8000) return 'medium';
  return 'high';
}

/**
 * 요청 body 에 temperature 를 조건부로 얹는다.
 * ★ 호출부에서 `temperature: 0.2` 를 직접 쓰지 말고 이걸 쓴다.
 */
export function withSamplingParams<T extends Record<string, unknown>>(
  body: T,
  model: string,
  params: { temperature?: number; top_p?: number; top_k?: number },
): T {
  if (!acceptsSamplingParams(model)) return body;
  const next = body as Record<string, unknown>;
  if (params.temperature !== undefined) next.temperature = params.temperature;
  if (params.top_p !== undefined) next.top_p = params.top_p;
  if (params.top_k !== undefined) next.top_k = params.top_k;
  return body;
}

/**
 * ★ 보내기 직전에 한 번 — 모델에 맞게 thinking·temperature 꼴을 고친다. 정상 본문엔 no-op.
 *   - 5.x: thinking.enabled → adaptive(+effort: 지정 없으면 budget 으로 환산), temperature 제거
 *   - 4.x: 그대로. 단 sampling 미허용 모델이면 temperature 제거. thinking 켜져 있으면 temperature 1 강제(API 제약)
 */
export function normalizeClaudeBody<T extends Record<string, unknown>>(body: T, opts: { effort?: ClaudeEffort } = {}): T {
  const b = body as Record<string, unknown>;
  const model = typeof b.model === 'string' ? b.model : '';
  const thinking = b.thinking as { type?: string; budget_tokens?: number } | undefined;
  if (usesAdaptiveThinking(model)) {
    delete b.temperature; delete b.top_p; delete b.top_k;
    if (thinking) {
      if (thinking.type !== 'adaptive') {
        const effort = opts.effort ?? effortFromBudget(thinking.budget_tokens);
        b.thinking = { type: 'adaptive' };
        if (!b.output_config) b.output_config = { effort };
      } else if (opts.effort && !b.output_config) {
        b.output_config = { effort: opts.effort };
      }
    }
    return body;
  }
  if (!acceptsSamplingParams(model)) { delete b.temperature; delete b.top_p; delete b.top_k; }
  if (thinking && thinking.type === 'enabled') b.temperature = 1;
  return body;
}
