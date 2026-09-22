import { describe, it, expect } from 'vitest';
import { splitMulticolumn } from './table-multicolumn';

describe('splitMulticolumn (분포고 #7, 2026-09-22)', () => {
  it('★ \\multicolumn{3}{c|}{\\text{1명만 선택}} → 내용 + span 3', () => {
    expect(splitMulticolumn('\\multicolumn{3}{c|}{\\text{1명만 선택}}')).toEqual({ content: '\\text{1명만 선택}', span: 3 });
  });
  it('중첩 중괄호(분수) 도 끝을 제대로 찾는다', () => {
    expect(splitMulticolumn('\\multicolumn{2}{c}{$\\dfrac{a}{b}$}')).toEqual({ content: '$\\dfrac{a}{b}$', span: 2 });
  });
  it('일반 셀은 그대로 span 1', () => {
    expect(splitMulticolumn(' \\text{구분} ')).toEqual({ content: '\\text{구분}', span: 1 });
    expect(splitMulticolumn('a')).toEqual({ content: 'a', span: 1 });
  });
  it('중괄호가 안 닫히면 손대지 않는다', () => {
    expect(splitMulticolumn('\\multicolumn{3}{c|}{\\text{깨짐')).toEqual({ content: '\\multicolumn{3}{c|}{\\text{깨짐', span: 1 });
  });
});
