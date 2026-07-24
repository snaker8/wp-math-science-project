import { describe, it, expect } from 'vitest';
import { matchBoxedLabel } from './box-conversion';

// ============================================================================
// ★ 2026-07-23 사고: \boxed{ ㉠ } 처럼 원문자 한글/원숫자만 든 빈칸 라벨은 KaTeX 에
//   폭 정보(metrics)가 없어 박스가 0폭으로 계산 → 라벨을 못 감싼다.
//   metrics 없는 라벨만 HTML 박스로 빼고, 진짜 수식 박스는 KaTeX 유지.
// ============================================================================

describe('matchBoxedLabel — KaTeX 폭 없는 빈칸 라벨만 HTML 박스로', () => {
  it('원문자 한글 ㉠~㉣ → HTML 박스 (실사고)', () => {
    expect(matchBoxedLabel('\\boxed{ ㉠ }')).toEqual({ label: '㉠' });
    expect(matchBoxedLabel('\\boxed{㉣}')).toEqual({ label: '㉣' });
  });

  it('빈 박스 \\boxed{ } → HTML 빈 박스', () => {
    expect(matchBoxedLabel('\\boxed{ }')).toEqual({ label: '' });
    expect(matchBoxedLabel('\\boxed{}')).toEqual({ label: '' });
  });

  it('원숫자·괄호숫자·한글 라벨도 대상', () => {
    expect(matchBoxedLabel('\\boxed{①}')).toEqual({ label: '①' });
    expect(matchBoxedLabel('\\boxed{ 가 }')).toEqual({ label: '가' });
    expect(matchBoxedLabel('\\fbox{㉥}')).toEqual({ label: '㉥' });
  });

  it('★ 진짜 수식 박스는 건드리지 않는다 (null → KaTeX 유지)', () => {
    expect(matchBoxedLabel('\\boxed{x+1}')).toBeNull();
    expect(matchBoxedLabel('\\boxed{3}')).toBeNull();
    expect(matchBoxedLabel('\\boxed{\\frac{a}{b}}')).toBeNull();
    expect(matchBoxedLabel('\\boxed{a \\times b}')).toBeNull();
  });

  it('boxed 가 아니면 null', () => {
    expect(matchBoxedLabel('x+y=4')).toBeNull();
    expect(matchBoxedLabel('\\begin{cases}x\\\\y\\end{cases}')).toBeNull();
  });

  it('앞뒤에 다른 수식이 붙으면 라벨 박스 아님 (전체가 boxed 여야)', () => {
    expect(matchBoxedLabel('a + \\boxed{㉠}')).toBeNull();
    expect(matchBoxedLabel('\\boxed{㉠} = 3')).toBeNull();
  });
});
