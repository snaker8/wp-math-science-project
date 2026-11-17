import { describe, it, expect } from 'vitest';
import { markUnderlineAcrossElements } from './underline-span';

const t = (value: string) => ({ type: 'text', value });
const m = (value: string) => ({ type: 'inline-math', value });

describe('markUnderlineAcrossElements', () => {
  it('텍스트 안의 <u>…</u>', () => {
    expect(markUnderlineAcrossElements([t('합을 <u>풀이과정과 함께</u> 구하시오.')])).toEqual([
      t('합을 '), { ...t('풀이과정과 함께'), underline: true }, t(' 구하시오.'),
    ]);
  });
  it('수식을 사이에 둔 밑줄', () => {
    expect(markUnderlineAcrossElements([t('<u>'), m('x'), t('의 값</u>을 구하시오.')])).toEqual([
      { ...m('x'), underline: true }, { ...t('의 값'), underline: true }, t('을 구하시오.'),
    ]);
  });
  it('굵게 표기(**)는 건드리지 않는다', () => {
    expect(markUnderlineAcrossElements([t('<u>**함께**</u>')])).toEqual([{ ...t('**함께**'), underline: true }]);
  });
  it('짝이 안 맞으면 태그만 걷는다', () => {
    expect(markUnderlineAcrossElements([t('합을 <u>풀이 구하시오.')])).toEqual([t('합을 풀이 구하시오.')]);
  });
  it('태그가 없으면 같은 배열을 돌려준다', () => {
    const els = [t('다음 중 옳은 것은?')];
    expect(markUnderlineAcrossElements(els)).toBe(els);
  });
});
