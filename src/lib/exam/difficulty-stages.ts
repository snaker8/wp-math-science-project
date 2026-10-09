// ============================================================================
// 평가 난이도 단계 → 밴드별 문항수 자동 배분 (출제 화면)
//
// ★ 2026-10-10 대표: "유형별 할 때 난이도 설정으로 매쓰홀릭처럼 자동 문제 개수 세팅 되도록" (02-problem-select.md 조사 +
//   매쓰홀릭 「출제 문제 구성」 캡처: 문제 수 10/15/20/25/30 + 평가 난이도 1~6단계 → 선택/가능/실제 출제 예상 문제 수 표).
//
//   비율은 우리 5밴드(개념·기본·실력·심화·고난도) 기준. ★ 매쓰홀릭 실측은 2단계 하나뿐
//   (15문항 → 기본 10 · 실력(하) 3 · 실력(중) 1 · 심화(하) 1 · 심화(중) 0 · 고난도 0). 2단계는 거기에 맞췄고,
//   나머지 단계는 그 곡선을 어려운 쪽으로 옮긴 우리 해석 — 미검증. 「내 단계」로 원장이 직접 비율을 저장해 덮어쓸 수 있다.
// ============================================================================

export type Band = '개념' | '기본' | '실력' | '심화' | '고난도';
export const BAND_ORDER: Band[] = ['개념', '기본', '실력', '심화', '고난도'];

export type BandRatios = Record<Band, number>;

/** 1단계(가장 쉬움) ~ 6단계(가장 어려움). 합 100. */
export const STAGE_RATIOS: Record<number, BandRatios> = {
  1: { 개념: 45, 기본: 35, 실력: 20, 심화: 0, 고난도: 0 },
  2: { 개념: 30, 기본: 35, 실력: 27, 심화: 8, 고난도: 0 },   // ← 매쓰홀릭 2단계 실측(기본 67%·실력 27%·심화 7%)에 맞춤
  3: { 개념: 15, 기본: 30, 실력: 35, 심화: 15, 고난도: 5 },
  4: { 개념: 10, 기본: 20, 실력: 35, 심화: 25, 고난도: 10 },
  5: { 개념: 5, 기본: 15, 실력: 30, 심화: 30, 고난도: 20 },
  6: { 개념: 0, 기본: 10, 실력: 20, 심화: 35, 고난도: 35 },
};
export const STAGE_LABELS: Record<number, string> = {
  1: '개념 위주', 2: '기본 다지기', 3: '표준', 4: '실력 강화', 5: '심화', 6: '최상위',
};

const EMPTY: BandRatios = { 개념: 0, 기본: 0, 실력: 0, 심화: 0, 고난도: 0 };

/**
 * total 문항을 ratios 비율로 밴드에 배분. 밴드별 가능 문항수(available)를 넘지 않게 자르고,
 * 잘린 몫은 가능 문항이 남은 밴드에 비율 순(가까운 밴드 우선)으로 넘긴다.
 * - 최대 나머지(largest remainder) 반올림으로 합이 정확히 total (가능 총량이 모자라면 그 총량).
 */
export function distributeByRatios(
  total: number,
  ratios: BandRatios,
  available?: Partial<Record<Band, number>>,
): BandRatios {
  const out: BandRatios = { ...EMPTY };
  const n = Math.max(0, Math.floor(total));
  if (n === 0) return out;
  const cap = (b: Band): number => {
    const v = available?.[b];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : Number.POSITIVE_INFINITY;
  };
  const sumRatio = BAND_ORDER.reduce((s, b) => s + Math.max(0, ratios[b] || 0), 0);
  if (sumRatio <= 0) return out;

  // 1) 비율 배분 (최대 나머지)
  const raw = BAND_ORDER.map((b) => (n * Math.max(0, ratios[b] || 0)) / sumRatio);
  const floors = raw.map((x) => Math.floor(x));
  let rest = n - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, frac: x - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) { if (rest <= 0) break; floors[i] += 1; rest -= 1; }
  BAND_ORDER.forEach((b, i) => { out[b] = floors[i]; });

  // 2) 가능 문항수로 자르고, 넘친 몫을 다른 밴드로 (비율이 큰 밴드부터, 같으면 인접 밴드 우선)
  let overflow = 0;
  for (const b of BAND_ORDER) {
    const c = cap(b);
    if (out[b] > c) { overflow += out[b] - c; out[b] = c; }
  }
  if (overflow > 0) {
    const byPriority = [...BAND_ORDER].sort((a, b) => (ratios[b] || 0) - (ratios[a] || 0));
    for (const b of byPriority) {
      if (overflow <= 0) break;
      const room = cap(b) - out[b];
      if (room <= 0) continue;
      const take = Math.min(room, overflow);
      out[b] += take; overflow -= take;
    }
  }
  return out;
}

/** 현재 밴드 값 → 비율(합 100, 정수). 전부 0이면 null. */
export function ratiosFromCounts(counts: Partial<Record<Band, number>>): BandRatios | null {
  const sum = BAND_ORDER.reduce((s, b) => s + Math.max(0, counts[b] || 0), 0);
  if (sum <= 0) return null;
  const r = distributeByRatios(100, {
    개념: counts.개념 || 0, 기본: counts.기본 || 0, 실력: counts.실력 || 0, 심화: counts.심화 || 0, 고난도: counts.고난도 || 0,
  });
  return r;
}
