// ============================================================================
// Anthropic 모델별 파라미터 허용 여부
// ============================================================================
//
// ★ 사고 이력 (2026-08-30)
//   Opus 4.7 부터 `temperature` / `top_p` / `top_k` 가 **제거**됐다. 보내면 400 이다.
//   모델 문자열만 올리고 파라미터를 안 본 탓에 두 곳이 동시에 깨져 있었다:
//     - reanalyze-crop 고급분석 "Opus" 선택 → claude-opus-4-7 + temperature 0.2 → 400 (throw, 사용자 노출)
//     - generate-solution Opus 폴백 → 은퇴 모델 claude-opus-4-1 → 404 (warn 만, 조용한 성능 저하)
//   같은 실수가 반복되지 않도록 판별을 한 곳에 모은다.
//
// ★ 기본값이 "허용 안 함" 인 이유
//   신규 모델은 전부 sampling 파라미터를 받지 않는 방향이다. 모르는 모델을 만나면
//   빼고 보내는 쪽이 안전하다 — 빼서 400 이 나는 경우는 없지만, 넣어서 400 이 나는 경우는 있다.
//   품질은 프롬프트로 잡는 것이 현재 권장 방식이다.

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
 *
 * 판단 못 하는 모델(빈 문자열·오타·신규)은 false — 빼고 보내는 쪽이 안전하다.
 */
export function acceptsSamplingParams(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.trim().toLowerCase();
  if (!m) return false;
  return SAMPLING_PARAM_ALLOWLIST.some(allowed => m === allowed || m.startsWith(`${allowed}-`));
}

/**
 * 요청 body 에 temperature 를 조건부로 얹는다.
 *
 * ★ 호출부에서 `temperature: 0.2` 를 직접 쓰지 말고 이걸 쓴다.
 *   모델을 올릴 때 파라미터를 같이 손봐야 한다는 걸 잊어도 안전하도록.
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
