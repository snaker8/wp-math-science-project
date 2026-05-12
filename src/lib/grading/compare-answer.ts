// ============================================================================
// 학생 답 ↔ 정답 자동 비교
//
// 자동 채점 범위:
//   - objective: 객관식 ① ~ ⑤  (normalizeObjectiveAnswer 재활용)
//   - numeric  : 숫자 단답 (정수 / 분수 a/b / 소수)
//   - manual   : 서답형 / 식 / 문장 — 자동 채점 보류 (isCorrect=null)
//
// 박힘 사고 방지: 객관식 모호값("0","5번")은 normalize에서 빈값으로 강등 →
// 빈값 vs 정상값은 isCorrect=null 로 처리 (잘못된 false 박힘 차단).
// ============================================================================

import { normalizeObjectiveAnswer } from '@/lib/validation/objective-answer';

export type GradeMode = 'objective' | 'numeric' | 'manual';

export interface GradeOutcome {
  /** true=정답, false=오답, null=자동채점 보류(서답형/모호값) */
  isCorrect: boolean | null;
  mode: GradeMode;
  /** 정규화된 학생 답 (저장·표시용) */
  normalizedStudent: string;
  /** 정규화된 정답 (디버그·표시용) */
  normalizedCorrect: string;
}

// ----------------------------------------------------------------------------
// 숫자/분수 판정
// ----------------------------------------------------------------------------
const NUMERIC_LIKE_RE = /^-?\d+(\.\d+)?$/;
const FRACTION_RE = /^(-?\d+)\/(-?\d+)$/;

/** 숫자 단답으로 자동채점할 수 있는 형태인지 (정수/소수/분수) */
export function isNumericLike(raw: string): boolean {
  if (!raw) return false;
  const v = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/[−–—]/g, '-');
  return NUMERIC_LIKE_RE.test(v) || FRACTION_RE.test(v);
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/**
 * 숫자 단답 정규화:
 *   - 공백·콤마 제거
 *   - 유니코드 마이너스(−–—)를 ASCII '-' 로 통일
 *   - 분수 약분 (2/4 → 1/2, -3/6 → -1/2)
 *   - 소수 끝의 0 제거 (3.50 → 3.5)
 *   - 정수 leading-zero 제거 (-007 → -7)
 *   - 숫자 아닌 입력은 trim 만 적용해 그대로 반환 (manual 모드에서 사용)
 */
export function normalizeNumericAnswer(raw: string): string {
  if (!raw) return '';
  let v = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/^\+/, '');

  const f = v.match(FRACTION_RE);
  if (f) {
    const aNum = parseInt(f[1], 10);
    const bNum = parseInt(f[2], 10);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || bNum === 0) return v;
    const sign = aNum * bNum < 0 ? '-' : '';
    const a = Math.abs(aNum);
    const b = Math.abs(bNum);
    const g = gcd(a, b);
    const an = a / g;
    const bn = b / g;
    return bn === 1 ? `${sign}${an}` : `${sign}${an}/${bn}`;
  }

  if (/^-?\d+\.\d+$/.test(v)) {
    // 소수: 끝의 0 제거 + 의미 없는 '.' 정리
    v = v.replace(/0+$/, '').replace(/\.$/, '');
    return v;
  }

  if (/^-?\d+$/.test(v)) {
    // 정수 정규화
    return String(parseInt(v, 10));
  }

  return v;
}

// ----------------------------------------------------------------------------
// 객관식 판정 보조
// ----------------------------------------------------------------------------
function isObjectiveAnswerJson(answerJson: Record<string, unknown> | null, correctRaw: string): boolean {
  if (!answerJson) {
    return /^[①②③④⑤]$/.test(correctRaw) || /^[1-5]$/.test(correctRaw);
  }
  if (answerJson.type === 'multiple_choice') return true;
  if (Array.isArray(answerJson.choices) && (answerJson.choices as unknown[]).length > 0) return true;
  // 보조: 정답 형식이 ①~⑤ 또는 1~5 한 글자면 객관식으로 본다
  return /^[①②③④⑤]$/.test(correctRaw) || /^[1-5]$/.test(correctRaw);
}

// ----------------------------------------------------------------------------
// 메인 — compareAnswer
// ----------------------------------------------------------------------------
/**
 * 학생 답을 problems.answer_json 의 정답과 비교한다.
 *
 * @param studentAnswer 학생이 입력한 raw 문자열 (① / 5 / 1/2 / x^2+1 등)
 * @param answerJson   problems.answer_json (finalAnswer / correct_answer / choices / type)
 * @returns GradeOutcome — isCorrect (true|false|null), 모드, 정규화 값
 */
export function compareAnswer(
  studentAnswer: string,
  answerJson: Record<string, unknown> | null,
): GradeOutcome {
  const finalAnswer = (answerJson?.finalAnswer ?? answerJson?.correct_answer ?? '') as unknown;
  const correctRaw = (typeof finalAnswer === 'string' ? finalAnswer : String(finalAnswer ?? '')).trim();
  const student = (studentAnswer ?? '').trim();

  // 객관식 우선 판정
  if (isObjectiveAnswerJson(answerJson, correctRaw)) {
    const a = normalizeObjectiveAnswer(student);
    const b = normalizeObjectiveAnswer(correctRaw);
    const isCorrect = a === '' || b === '' ? null : a === b;
    return { isCorrect, mode: 'objective', normalizedStudent: a, normalizedCorrect: b };
  }

  // 숫자 단답
  if (isNumericLike(correctRaw)) {
    if (!student) {
      return { isCorrect: null, mode: 'numeric', normalizedStudent: '', normalizedCorrect: normalizeNumericAnswer(correctRaw) };
    }
    if (!isNumericLike(student)) {
      // 학생이 식·문장으로 답 → 자동채점 보류 (강사 확인 필요)
      return {
        isCorrect: null,
        mode: 'numeric',
        normalizedStudent: student,
        normalizedCorrect: normalizeNumericAnswer(correctRaw),
      };
    }
    const a = normalizeNumericAnswer(student);
    const b = normalizeNumericAnswer(correctRaw);
    return { isCorrect: a === b, mode: 'numeric', normalizedStudent: a, normalizedCorrect: b };
  }

  // 서답형 — 자동채점 보류
  return {
    isCorrect: null,
    mode: 'manual',
    normalizedStudent: student,
    normalizedCorrect: correctRaw,
  };
}
