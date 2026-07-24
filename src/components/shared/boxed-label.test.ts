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

import { splitLabeledBoxItems } from './box-conversion';

describe('splitLabeledBoxItems — 보기 박스 라벨 항목 분리 (2열 배치용)', () => {
  it('ㄱ~ㅁ cases 5개 → 5항목', () => {
    const box = 'ㄱ. ${\begin{cases}x+y=4 \\ 2x+y=5\end{cases}}$\nㄴ. ${\begin{cases}3x-2y=7 \\ -x+5y=2\end{cases}}$\nㄷ. ${\begin{cases}x+2y=5 \\ 4x+y=13\end{cases}}$\nㄹ. ${\begin{cases}x+y=4 \\ x+2y=7\end{cases}}$\nㅁ. ${\begin{cases}x+3y=9 \\ 5x-9y=6\end{cases}}$';
    const items = splitLabeledBoxItems(box);
    expect(items).not.toBeNull();
    expect(items!.length).toBe(5);
    expect(items![0].startsWith('ㄱ.')).toBe(true);
    expect(items![4].startsWith('ㅁ.')).toBe(true);
  });

  it('라벨 없는 줄은 직전 항목에 붙는다', () => {
    const box = 'ㄱ. 첫째 조건\n계속되는 설명\nㄴ. 둘째 조건';
    const items = splitLabeledBoxItems(box);
    expect(items!.length).toBe(2);
    expect(items![0]).toContain('계속되는 설명');
  });

  it('원숫자·괄호한글 라벨도 인식', () => {
    expect(splitLabeledBoxItems('① 가\n② 나\n③ 다')!.length).toBe(3);
    expect(splitLabeledBoxItems('(가) 하나\n(나) 둘')!.length).toBe(2);
  });

  it('★ 라벨로 시작 안 하는 텍스트 박스 → null (기존 흐름 유지, 회귀 0)', () => {
    expect(splitLabeledBoxItems('어떤 사건 A 가 일어날 확률을 p 라고 하면')).toBeNull();
    expect(splitLabeledBoxItems('$x=3$ 이고 $y=1$ 이다.')).toBeNull();
  });

  it('항목 1개면 그리드 불필요 → null', () => {
    expect(splitLabeledBoxItems('ㄱ. 하나뿐')).toBeNull();
  });
});
