// ============================================================================
// 객관식 정답 검증·정규화 — 모든 진입 경로(자산화/모달/PATCH)에서 공유.
//
// 박힘 사고 차단 정책:
//   - ① ~ ⑤ 또는 1~5 → 정상값
//   - null / undefined / "" → 빈값(미입력) 허용 — 자산화 직후 미터치 상태
//   - "0", "5번", "0번", 다른 임의값 → 모호값(박힘) → 빈값으로 강제
//
// 메모리: feedback_objective_answer_safety.md (DB 진단 261개 박힘 사고 학습)
// ============================================================================

const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;
const NUM_TO_CIRCLED: Record<number, string> = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' };

/**
 * 객관식 정답이 정상값인지 검사.
 *  - true: ① ~ ⑤ 또는 1~5
 *  - false: 0, 5번, 임의 문자열 등 (박힘 후보)
 * 빈값/null 은 별도 처리 — `isEmptyAnswer()` 사용.
 */
export function isValidObjectiveAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 5;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return false;
    return /^[①②③④⑤]$/.test(s) || /^[1-5]$/.test(s);
  }
  return false;
}

/** 빈값(미입력) 여부 — 자산화 직후 정상 상태. */
export function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * 객관식 정답 정규화 — 정상값은 ① ~ ⑤ 로 통일, 모호값은 빈값으로.
 *  - "①" → "①"
 *  - "1" / 1 → "①"
 *  - "0" / 0 / "5번" / 임의 문자열 → "" (박힘 차단)
 *  - null / undefined / "" → "" (미입력 그대로)
 */
export function normalizeObjectiveAnswer(value: unknown): string {
  if (isEmptyAnswer(value)) return '';
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) {
    return NUM_TO_CIRCLED[value];
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (CIRCLED.includes(s as any)) return s;
    if (/^[1-5]$/.test(s)) return NUM_TO_CIRCLED[Number(s)];
  }
  // 모호값 ("0", "5번", "abc" 등) → 빈값으로 강제 (박힘 차단)
  return '';
}
