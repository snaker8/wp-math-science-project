import { describe, it, expect } from 'vitest';
import { answersMatch, normalizeAnswerForCompare } from './strategy-verify';

// ★ 이 파일은 Write 도구로 만든다 — bash heredoc 은 `\\` 를 반으로 깎아 `\c`·`\f` 가 돼 버린다 (2026-10-12 실측)
describe('공략 검산 — 정답 비교', () => {
  it('원형 번호·괄호·"번" 은 숫자로', () => {
    expect(normalizeAnswerForCompare('③')).toBe('3');
    expect(normalizeAnswerForCompare('(3)')).toBe('3');
    expect(normalizeAnswerForCompare('3번')).toBe('3');
    expect(answersMatch('3', '③')).toBe(true);
  });
  it('각도·단위·$ 무시', () => {
    expect(answersMatch('$126^{\\circ}$', '126°')).toBe(true);
    expect(answersMatch('12 cm^2', '$12$')).toBe(true);
  });
  it('분수는 수치로', () => {
    expect(answersMatch('\\frac{1}{2}', '0.5')).toBe(true);
    expect(answersMatch('1/2', '$\\dfrac{1}{2}$')).toBe(true);
  });
  it('다르면 false, 빈 값은 false', () => {
    expect(answersMatch('132', '126')).toBe(false);
    expect(answersMatch('', '126')).toBe(false);
  });
});
