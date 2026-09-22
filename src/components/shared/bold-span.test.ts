import { describe, it, expect } from 'vitest';
import { markBoldAcrossElements } from './bold-span';

const t = (value: string): { type: string; value: string; bold?: boolean } => ({ type: 'text', value });
const m = (value: string): { type: string; value: string; bold?: boolean } => ({ type: 'inline-math', value });

describe('markBoldAcrossElements — 수식을 사이에 둔 **굵게** (주례여고, 2026-09-22)', () => {
  it('★ `**❷ $l$이 $y$축에 평행할 때**` — 수식 포함 전부 bold, ** 는 사라진다', () => {
    const out = markBoldAcrossElements([t('**❷ '), m('l'), t('이 '), m('y'), t('축에 평행할 때**'), t('\n직선 ')]);
    expect(out.map((e) => [e.type, e.value, !!e.bold])).toEqual([
      ['text', '❷ ', true], ['inline-math', 'l', true], ['text', '이 ', true], ['inline-math', 'y', true],
      ['text', '축에 평행할 때', true], ['text', '\n직선 ', false],
    ]);
  });
  it('같은 요소 안의 **굵게** 도 처리, 앞뒤는 그대로', () => {
    const out = markBoldAcrossElements([t('앞 **가운데** 뒤')]);
    expect(out.map((e) => [e.value, !!e.bold])).toEqual([['앞 ', false], ['가운데', true], [' 뒤', false]]);
  });
  it('★ 짝이 안 맞으면 굵게 없이 ** 만 걷는다 — 인쇄 지면에 찌꺼기 노출 금지', () => {
    const out = markBoldAcrossElements([t('값 ** 그대로'), m('x')]);
    expect(out.map((e) => [e.value, !!e.bold])).toEqual([['값  그대로', false], ['x', false]]);
  });
  it('** 가 없으면 원본 배열 반환', () => {
    const src = [t('a'), m('b')];
    expect(markBoldAcrossElements(src)).toBe(src);
  });
});
