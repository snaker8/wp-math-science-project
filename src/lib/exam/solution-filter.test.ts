import { describe, expect, it } from 'vitest';
import { applySolutionFilter, parseWithSolution } from './solution-filter';

describe('parseWithSolution', () => {
  it('켜짐 값만 true', () => {
    for (const v of [true, 1, '1', 'true']) expect(parseWithSolution(v)).toBe(true);
    for (const v of [false, 0, '0', '', null, undefined, 'yes']) expect(parseWithSolution(v)).toBe(false);
  });
});

describe('applySolutionFilter', () => {
  const fake = () => {
    const calls: string[] = [];
    const q = {
      not(c: string, op: string, v: unknown) { calls.push(`not ${c} ${op} ${v}`); return q; },
      neq(c: string, v: unknown) { calls.push(`neq ${c} '${v}'`); return q; },
    };
    return { q, calls };
  };
  it('꺼지면 쿼리를 건드리지 않는다', () => {
    const { q, calls } = fake();
    expect(applySolutionFilter(q, false)).toBe(q);
    expect(calls).toEqual([]);
  });
  it('켜면 해설 칸이 비지 않은 것만', () => {
    const { q, calls } = fake();
    applySolutionFilter(q, true);
    expect(calls).toEqual(['not solution_latex is null', "neq solution_latex ''"]);
  });
});
