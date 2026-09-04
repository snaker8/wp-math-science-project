import { describe, it, expect } from 'vitest';
import { planSteps, summarizePlan } from './course-ladder';

describe('course-ladder · 회차 계단', () => {
  it('공급이 넉넉하면 소단원 하나에 개념→기본→실력→심화 4회차, 회차당 perStep', () => {
    const steps = planSteps([{ unit: 'U1', name: '중복순열', supply: { A: 30, B: 30, C: 30, D: 30 } }], { perStep: 10 });
    expect(steps.map((s) => s.label)).toEqual(['1회차', '2회차', '3회차', '4회차']);
    expect(steps.map((s) => s.total)).toEqual([10, 10, 10, 10]);
    expect(steps[0].levelPlan).toEqual({ A: 9, B: 1 });     // 매쓰홀릭 1회차 개념 9 · 기본 1
    expect(steps[1].levelPlan).toEqual({ B: 6, C: 4 });     // 2회차 기본 6 · 실력 4
    expect(steps[2].levelPlan).toEqual({ C: 9, D: 1 });     // 3회차 실력 위주 (0.85·10=8.5→9)
    expect(steps[3].levelPlan).toEqual({ D: 10 });
    expect(steps.every((s) => !s.short)).toBe(true);
  });

  it('★ 공급이 모자라면 회차를 없는 척 안 만들고, 짧은 회차는 short 로 표시한다', () => {
    // 개념 3 · 기본 2 뿐 (중3-1 실측: 유형당 평균 3.1문제)
    const steps = planSteps([{ unit: 'U1', name: '제곱근', supply: { A: 3, B: 2, C: 0, D: 0 } }], { perStep: 10 });
    // 기본단은 1문항뿐 → 회차로 세우지 않고 1회차에 얹는다 (1문항짜리 2회차는 회차가 아니다)
    expect(steps).toHaveLength(1);
    expect(steps[0].levelPlan).toEqual({ A: 3, B: 2 });
    expect(steps[0].total).toBe(5);
    expect(steps[0].short).toBe(false);                     // 5 는 10 의 절반 — 짧진 않다

    const tiny = planSteps([{ unit: 'U1', name: 'x', supply: { A: 2, B: 0, C: 0, D: 0 } }], { perStep: 10 });
    expect(tiny).toHaveLength(1);                           // 첫 회차는 짧아도 세운다
    expect(tiny[0].short).toBe(true);
  });

  it('앞 회차가 쓴 공급은 뒤 회차에서 빠진다 — 같은 문제를 두 번 계획하지 않는다', () => {
    const steps = planSteps([{ unit: 'U1', name: 'x', supply: { A: 2, B: 7, C: 0, D: 0 } }], { perStep: 10 });
    // 1회차(개념단) 개념 2 + 기본 1 → 기본은 6 남는다 → 2회차(기본단) 기본 6
    expect(steps.map((s) => s.levelPlan)).toEqual([{ A: 2, B: 1 }, { B: 6 }]);
    expect(steps.map((s) => s.rungLabel)).toEqual(['개념', '기본']);
    expect(steps.reduce((n, s) => n + s.total, 0)).toBe(9);
  });

  it('앞 회차가 꽉 찼으면 자투리는 버린다 — 같은 문제를 두 번 계획하지 않는다', () => {
    const steps = planSteps([{ unit: 'U1', name: 'x', supply: { A: 20, B: 1, C: 0, D: 0 } }], { perStep: 10 });
    // 1회차 개념 9 + 기본 1 = 10 (꽉 참). 기본단은 남은 게 0 → 없음. 개념 11개 남지만 개념단은 하나뿐.
    expect(steps).toHaveLength(1);
    expect(steps[0].levelPlan).toEqual({ A: 9, B: 1 });
  });

  it('주 밴드에 공급이 없는 단은 건너뛴다 — 개념 문제 없는 「개념 회차」를 만들지 않는다', () => {
    const steps = planSteps([{ unit: 'U1', name: 'x', supply: { A: 0, B: 7, C: 0, D: 0 } }], { perStep: 10 });
    expect(steps).toHaveLength(1);
    expect(steps[0].rungLabel).toBe('기본');
    expect(steps[0].label).toBe('1회차');           // 소단원 안 순서는 1부터
    expect(steps[0].levelPlan).toEqual({ B: 7 });
  });

  it('비율로 자른 뒤 남는 자리는 같은 단의 남은 공급으로 채운다', () => {
    // 기본단: B 0.6→6, C 0.4→4. C 가 1개뿐이면 주 밴드 B 로 채워 10 을 맞춘다
    const steps = planSteps([{ unit: 'U1', name: 'x', supply: { A: 0, B: 20, C: 1, D: 0 } }], { perStep: 10 });
    const rung2 = steps.find((s) => s.rungLabel === '기본')!;
    expect(rung2.levelPlan).toEqual({ B: 9, C: 1 });
    expect(rung2.total).toBe(10);
  });

  it('여러 소단원 → seq 는 코스 전체 순서, unitRound 는 소단원 안 순서', () => {
    const steps = planSteps([
      { unit: 'U1', name: 'a', supply: { A: 10, B: 10, C: 0, D: 0 } },
      { unit: 'U2', name: 'b', supply: { A: 10, B: 0, C: 0, D: 0 } },
    ], { perStep: 10 });
    expect(steps.map((s) => [s.seq, s.unit, s.unitRound])).toEqual([[1, 'U1', 1], [2, 'U1', 2], [3, 'U2', 1]]);
    const sum = summarizePlan([{ unit: 'U1', name: 'a', supply: {} }, { unit: 'U2', name: 'b', supply: {} }, { unit: 'U3', name: 'c', supply: {} }], steps);
    expect(sum.unitsCovered).toBe(2);
    expect(sum.unitsEmpty).toEqual(['U3']);
    expect(sum.steps).toBe(3);
  });

  it('공급 0 인 소단원은 회차가 없다', () => {
    expect(planSteps([{ unit: 'U0', name: 'empty', supply: {} }])).toEqual([]);
  });
});
