import { describe, it, expect } from 'vitest';
import { sortProblemIds, sameOrder } from './sort-problems';

const P = [
  { id: 'a', typeCode: 'MS07-01-02-01-03', difficulty: 7, choices: [] },
  { id: 'b', typeCode: 'MS07-01-01-02-01', difficulty: 3, choices: ['1', '2'] },
  { id: 'c', typeCode: 'MS07-01-01-01-05', difficulty: 5, choices: [] },
  { id: 'd', typeCode: 'MS07-01-01-02-01', difficulty: 3, choices: ['1', '2'] },
];

describe('sortProblemIds', () => {
  it('단원별 — 소단원 순, 같은 단원은 원래 순서', () => {
    expect(sortProblemIds(P, 'unit')).toEqual(['c', 'b', 'd', 'a']);
  });
  it('유형별 — 유형 코드 순 (같은 코드면 원래 순서)', () => {
    expect(sortProblemIds(P, 'type')).toEqual(['c', 'b', 'd', 'a']);
  });
  it('주관식 후순위 — 객관식 먼저, 나머지는 원래 순서', () => {
    expect(sortProblemIds(P, 'subjective-last')).toEqual(['b', 'd', 'a', 'c']);
  });
  it('난이도 오름/내림 — 같은 난이도면 원래 순서', () => {
    expect(sortProblemIds(P, 'diff-asc')).toEqual(['b', 'd', 'c', 'a']);
    expect(sortProblemIds(P, 'diff-desc')).toEqual(['a', 'c', 'b', 'd']);
  });
  it('랜덤 — 같은 집합, rng 고정이면 재현', () => {
    let s = 3; const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const out = sortProblemIds(P, 'shuffle', rng);
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('sameOrder', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});
