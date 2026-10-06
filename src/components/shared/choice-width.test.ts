import { describe, it, expect } from 'vitest';
import { estimateChoiceWidth, planHorizontalChoices } from './choice-width';

const w = (arr: string[]) => arr.map(estimateChoiceWidth);

describe('estimateChoiceWidth', () => {
  it('sin 60° 꼴은 6, sin A 는 4, -√3 은 3, 분수는 1', () => {
    expect(estimateChoiceWidth('$\\sin 60^{\\circ}$')).toBe(6);
    expect(estimateChoiceWidth('$\\sin A$')).toBe(4);
    expect(estimateChoiceWidth('$-\\sqrt{3}$')).toBe(3);
    expect(estimateChoiceWidth('$\\frac{1}{3}$')).toBe(1);
    expect(estimateChoiceWidth('$\\frac{13}{12}$')).toBe(2);
  });
  it('수식 밖 글자도 센다', () => {
    expect(estimateChoiceWidth('제1사분면')).toBe(5);
    expect(estimateChoiceWidth('$x$ 축')).toBe(2);
  });
});

describe('planHorizontalChoices (가로 5 배치)', () => {
  it('부흥중 #3 sin 0°~tan 60° → 3+2 (대표: "3,2 가 맞다 / 5열은 길다")', () => {
    expect(planHorizontalChoices(w(['$\\sin 0^{\\circ}$', '$\\cos 0^{\\circ}$', '$\\sin 60^{\\circ}$', '$\\cos 60^{\\circ}$', '$\\tan 60^{\\circ}$']))).toBe('grid3');
  });
  it('학장중 #1 sinA~tanC, #3 -√3~√3, 분수 5개 → 한 줄', () => {
    expect(planHorizontalChoices(w(['$\\sin A$', '$\\cos B$', '$\\tan B$', '$\\cos C$', '$\\tan C$']))).toBe('row');
    expect(planHorizontalChoices(w(['$-\\sqrt{3}$', '$0$', '$1$', '$\\sqrt{2}$', '$\\sqrt{3}$']))).toBe('row');
    expect(planHorizontalChoices(w(['$\\frac{5}{13}$', '$\\frac{5}{12}$', '$\\frac{13}{12}$', '$\\frac{12}{5}$', '$\\frac{13}{5}$']))).toBe('row');
  });
  it('긴 보기는 종전 흐름 배치', () => {
    expect(planHorizontalChoices(w(['$y = 2x^2 - 3x + 1$', '$y = -x^2 + 4$', '$y = x^2$', '$y = 3x$', '$y = 1$']))).toBe('flow');
  });
});
