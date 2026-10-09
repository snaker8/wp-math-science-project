import { describe, it, expect } from 'vitest';
import { distributeByRatios, ratiosFromCounts, STAGE_RATIOS, BAND_ORDER } from './difficulty-stages';

const sum = (r: Record<string, number>) => BAND_ORDER.reduce((s, b) => s + r[b], 0);

describe('distributeByRatios', () => {
  it('합이 정확히 total (모든 단계 × 10/15/20/25/30)', () => {
    for (const stage of [1, 2, 3, 4, 5, 6]) {
      for (const n of [10, 15, 20, 25, 30]) {
        expect(sum(distributeByRatios(n, STAGE_RATIOS[stage]))).toBe(n);
      }
    }
  });
  it('2단계 15문항 — 매쓰홀릭 실측(기본 67%·실력 27%·심화 7%)과 같은 모양', () => {
    const r = distributeByRatios(15, STAGE_RATIOS[2]);
    expect(r.개념 + r.기본).toBe(10);
    expect(r.실력).toBe(4);
    expect(r.심화).toBe(1);
    expect(r.고난도).toBe(0);
  });
  it('가능 문항수를 넘지 않고 넘친 몫은 다른 밴드로', () => {
    const r = distributeByRatios(20, STAGE_RATIOS[3], { 고난도: 0, 심화: 1, 실력: 4 });
    expect(r.고난도).toBe(0);
    expect(r.심화).toBe(1);
    expect(r.실력).toBe(4);
    expect(sum(r)).toBe(20);
  });
  it('가능 총량이 total 보다 적으면 가능 총량까지만', () => {
    const r = distributeByRatios(25, STAGE_RATIOS[4], { 개념: 2, 기본: 3, 실력: 4, 심화: 1, 고난도: 0 });
    expect(sum(r)).toBe(10);
  });
  it('0 이면 전부 0', () => {
    expect(sum(distributeByRatios(0, STAGE_RATIOS[1]))).toBe(0);
  });
});

describe('ratiosFromCounts', () => {
  it('현재 값 → 합 100 비율, 전부 0 이면 null', () => {
    expect(ratiosFromCounts({ 개념: 0, 기본: 0 })).toBeNull();
    const r = ratiosFromCounts({ 개념: 1, 기본: 6, 실력: 10, 심화: 6, 고난도: 2 })!;
    expect(sum(r)).toBe(100);
    expect(r.실력).toBe(40);
  });
});
