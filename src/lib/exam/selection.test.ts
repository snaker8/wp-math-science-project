import { describe, it, expect } from 'vitest';
import {
  capPerType, deterministicRng, pickByBand, pickRandom, pickEvenByUnit, roundRobinPick,
  parsePerTypeCap, parseSelectionMode, unitKeyOf, orderForPaper, bandOfRow, type PoolRow,
} from './selection';

const row = (id: string, type: string, d: number): PoolRow => ({ problem_id: id, type_code: type, difficulty: d });
const seq = (seed = 1) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

describe('parse', () => {
  it('상한 0~4, 방식 기본 band', () => {
    expect(parsePerTypeCap(undefined)).toBe(0);
    expect(parsePerTypeCap('3')).toBe(3);
    expect(parsePerTypeCap(9)).toBe(4);
    expect(parseSelectionMode('even')).toBe('even');
    expect(parseSelectionMode('x')).toBe('band');
    expect(unitKeyOf('MS07-01-03-02-05')).toBe('MS07-01-03-02');
    expect(unitKeyOf('MS07-01-03-02')).toBe('MS07-01-03-02');
  });
});

describe('capPerType', () => {
  const rows = [
    row('a', 'T1', 2), row('b', 'T1', 4), row('c', 'T1', 6),
    row('d', 'T2', 3), row('a', 'T2', 2),
  ];
  it('cap 0 이면 중복 problem_id 만 걷고 그대로', () => {
    expect(capPerType(rows, 0).map((r) => r.problem_id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('유형마다 cap 개, 결정적 순서는 problem_id 순, 한 문제는 한 번만', () => {
    const out = capPerType(rows, 2, deterministicRng).map((r) => r.problem_id);
    expect(out).toEqual(['a', 'b', 'd']);
  });
  it('무작위 순서도 유형당 cap 을 넘지 않는다', () => {
    const out = capPerType(rows, 1, seq(7));
    const t1 = out.filter((r) => r.type_code === 'T1').length;
    expect(t1).toBe(1);
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe('roundRobinPick / pickRandom / pickEvenByUnit', () => {
  it('묶음을 돌아가며 뽑고 빈 묶음은 건너뛴다', () => {
    const g1 = [row('a', 'T', 1), row('b', 'T', 1)];
    const g2 = [row('c', 'T', 1)];
    const g3: PoolRow[] = [];
    expect(roundRobinPick([g1, g2, g3], 3)).toEqual(['a', 'c', 'b']);
    expect(roundRobinPick([g1, g2], 10)).toEqual(['a', 'c', 'b']);
  });
  it('무작위는 밴드가 골고루 (개념·기본·실력 각 1씩 → 3문항)', () => {
    const rows = [row('k1', 'T', 1), row('k2', 'T', 2), row('b1', 'T', 4), row('s1', 'T', 6), row('s2', 'T', 7)];   // 개념 1~3 · 기본 4~5 · 실력 6~7
    const ids = pickRandom(rows, 3, seq(3));
    const bands = new Set(ids.map((id) => bandOfRow(rows.find((r) => r.problem_id === id)!)));
    expect(bands.size).toBe(3);
  });
  it('소단원별 균등은 소단원을 번갈아 (2개 소단원 → 4문항이면 2:2)', () => {
    const rows = [
      row('u1a', 'MS07-01-01-01-01', 3), row('u1b', 'MS07-01-01-01-02', 3), row('u1c', 'MS07-01-01-01-03', 3),
      row('u2a', 'MS07-01-01-02-01', 3), row('u2b', 'MS07-01-01-02-02', 3),
    ];
    const ids = pickEvenByUnit(rows, 4, seq(5));
    const u1 = ids.filter((id) => id.startsWith('u1')).length;
    expect(u1).toBe(2);
    expect(ids.length).toBe(4);
  });
});

describe('pickByBand', () => {
  const rows = [
    row('k1', 'T1', 1), row('k2', 'T1', 2),      // 개념
    row('b1', 'T2', 4), row('b2', 'T2', 5),      // 기본
    row('s1', 'T3', 8), row('s2', 'T3', 9),      // 심화
  ];
  it('밴드별 배분대로, 모자라면 전체에서 채운다', () => {
    const { ids } = pickByBand(rows, { '개념': 1, '기본': 1, '심화': 2 }, {}, seq(1));
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);
  });
  it('유형별 최소를 먼저 채우고 그 밴드 배분을 깎는다', () => {
    const { ids } = pickByBand(rows, { '개념': 1, '기본': 1 }, { T3: 1 }, seq(2));
    expect(ids.some((id) => id.startsWith('s'))).toBe(true);
    expect(ids.length).toBe(3);
  });
});

describe('orderForPaper', () => {
  it('난이도 오름순 → 같은 난이도면 유형 코드 순', () => {
    const rows = [row('x', 'T2', 7), row('y', 'T1', 5), row('z', 'T1', 2)];
    expect(orderForPaper(['x', 'y', 'z'], rows)).toEqual(['z', 'y', 'x']);
  });
});
