// ============================================================================
// 회차 계단 — 소단원 × 문제은행 공급 → 회차 계획 (순수 함수)
// ----------------------------------------------------------------------------
// docs/PLAN_COURSE_LAYER.md §2 · 매쓰홀릭 설정 탭 실측(10 문서 §0):
//   1회차 개념 9 · 기본 1  →  2회차 기본 6 · 실력(하) 4  →  3회차 실력(하) 6 · 실력(중) 1  →  (심화)
// 회차마다 난이도가 한 단씩 올라간다. 소단원 하나를 1~4회차로 쪼갠다.
//
// 규칙:
//  · 계단(ladder)의 각 단은 밴드 비율. 회차당 문항(perStep)에 비율을 곱해 밴드별 문항을 정하고,
//    그 밴드의 **남은 공급**으로 자른다(앞 회차가 쓴 문제는 다시 못 쓰니 공급에서 뺀다).
//  · 그렇게 해서 문항이 하나도 안 잡히면 그 단은 회차를 만들지 않는다.
//  · perStep 의 절반도 못 채우면 short=true — 「문제은행이 모자라 짧은 회차」로 표시한다. 없는 척하지 않는다.
//  · 그 단의 **주 밴드**(비율이 가장 큰 밴드)에 공급이 없으면 그 단은 건너뛴다 — 「개념 회차」에 개념 문제가 없으면 거짓말이다.
//  · 비율대로 자른 뒤 남는 자리는 주 밴드의 남은 공급으로만 채운다 — 계단 모양(회차마다 한 단씩)을 지킨다.
//  · 문항이 MIN_STEP 미만인 단은 회차로 세우지 않는다 — 1문항짜리 「2회차」는 회차가 아니다(매쓰홀릭 회차 최소 실측 7).
//    앞 회차에 자리가 남으면 거기에 얹고, 없으면 버린다(문제은행이 자라면 다시 계획). 소단원의 첫 회차만은 짧아도 세운다.
// ============================================================================

export interface LadderRung {
  /** 밴드 키 → 비율 (합 1). 예 { A: 0.9, B: 0.1 } */
  mix: Record<string, number>;
  label: string;
}

/** 매쓰홀릭 실측을 4밴드로 옮긴 기본 계단 */
export const DEFAULT_LADDER: readonly LadderRung[] = [
  { mix: { A: 0.9, B: 0.1 }, label: '개념' },
  { mix: { B: 0.6, C: 0.4 }, label: '기본' },
  { mix: { C: 0.85, D: 0.15 }, label: '실력' },
  { mix: { D: 1 }, label: '심화' },
];

/** 이 미만이면 회차로 세우지 않는다 (소단원의 첫 회차 제외) */
export const MIN_STEP = 3;

export interface UnitSupply {
  unit: string;
  name: string;
  /** 밴드 키 → 문제은행 문항 수 */
  supply: Record<string, number>;
}

export interface PlannedStep {
  seq: number;
  unit: string;
  unitName: string;
  unitRound: number;
  label: string;
  /** 계단 단 이름 (개념·기본·실력·심화) */
  rungLabel: string;
  /** 밴드 키 → 문항 수 */
  levelPlan: Record<string, number>;
  total: number;
  short: boolean;
}

export interface LadderOptions {
  perStep?: number;
  ladder?: readonly LadderRung[];
  /** 밴드 순서 (쉬움 → 어려움) — 남는 자리 채울 때 쓴다 */
  bandOrder?: readonly string[];
}

export function planSteps(units: UnitSupply[], opts: LadderOptions = {}): PlannedStep[] {
  const perStep = Math.max(1, Math.round(opts.perStep ?? 10));
  const ladder = opts.ladder ?? DEFAULT_LADDER;
  const order = opts.bandOrder ?? ['A', 'B', 'C', 'D'];
  const out: PlannedStep[] = [];
  let seq = 0;

  for (const u of units) {
    const left: Record<string, number> = {};
    for (const b of order) left[b] = Math.max(0, Math.floor(u.supply[b] ?? 0));
    let round = 0;

    for (const rung of ladder) {
      const primary = Object.entries(rung.mix).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!primary || (left[primary] ?? 0) <= 0) continue;
      const plan: Record<string, number> = {};
      let total = 0;
      // 1) 비율대로 — 주 밴드부터, 합이 perStep 을 넘지 않게
      for (const [band, ratio] of Object.entries(rung.mix).sort((a, b) => b[1] - a[1])) {
        const want = Math.min(Math.round(perStep * ratio), perStep - total);
        const take = Math.min(want, left[band] ?? 0);
        if (take > 0) { plan[band] = take; total += take; }
      }
      // 2) 남는 자리는 주 밴드의 남은 공급으로만
      if (total < perStep) {
        const more = Math.min(perStep - total, (left[primary] ?? 0) - (plan[primary] ?? 0));
        if (more > 0) { plan[primary] = (plan[primary] ?? 0) + more; total += more; }
      }
      if (total === 0) continue;
      const prev = round > 0 ? out[out.length - 1] : null;
      if (total < MIN_STEP && prev) {
        // 앞 회차에 얹을 수 있는 만큼만 얹는다
        let room = perStep - prev.total;
        for (const [band, n] of Object.entries(plan)) {
          const add = Math.min(n, room);
          if (add <= 0) continue;
          prev.levelPlan[band] = (prev.levelPlan[band] ?? 0) + add;
          prev.total += add;
          left[band] -= add;
          room -= add;
        }
        prev.short = prev.total * 2 < perStep;
        continue;
      }
      for (const [band, n] of Object.entries(plan)) left[band] -= n;
      round += 1;
      seq += 1;
      out.push({
        seq,
        unit: u.unit,
        unitName: u.name,
        unitRound: round,
        label: `${round}회차`,
        rungLabel: rung.label,
        levelPlan: plan,
        total,
        short: total * 2 < perStep,
      });
    }
  }
  return out;
}

/** 코스 요약 — 회차 수·문항 수·짧은 회차 수·회차가 하나도 안 잡힌 소단원 */
export function summarizePlan(units: UnitSupply[], steps: PlannedStep[]) {
  const covered = new Set(steps.map((s) => s.unit));
  return {
    steps: steps.length,
    problems: steps.reduce((n, s) => n + s.total, 0),
    short: steps.filter((s) => s.short).length,
    unitsTotal: units.length,
    unitsCovered: covered.size,
    unitsEmpty: units.filter((u) => !covered.has(u.unit)).map((u) => u.unit),
  };
}
