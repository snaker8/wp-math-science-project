// ============================================================================
// 숙달 추정 — 매쓰홀릭 「● AI 예측 유형」 대응 (규칙 기반, 외부 호출 0, 비용 0)
// ----------------------------------------------------------------------------
// 매쓰홀릭 화면 안내: "● 모양은 AI 예측 유형 분석결과입니다."  실측(08 §2): 457칸 중
// 실제로 푼 사각형 칸은 일부고, 나머지는 원형(예측) 칸으로 채워져 있어 화면이 살아 있다.
// 예측이 없으면 대부분이 회색이라 화면이 쓸모없어진다 — 그래서 이 기능이 있어야 한다.
//
// 우리는 LLM 을 안 쓴다. 이미 채점된 형제 칸에서 **근거를 말할 수 있는 만큼만** 추정한다.
// 모든 추정 칸은 basis(근거 문장)를 들고 다니고, 화면에서 원형으로 구분되며, 토글로 끌 수 있다.
//
// 규칙 (우선순위 순, 첫 매치 채택):
//  R1 같은 소단원 · 더 어려운 밴드가 잘함/마스터 → 이 칸(더 쉬운 밴드)도 잘함으로 추정
//  R2 같은 소단원 · 더 쉬운 밴드가 약점/심각    → 이 칸(더 어려운 밴드)도 약점으로 추정
//  R3 같은 중단원 형제 소단원들 · 같은 밴드에 판정된 칸이 2개 이상 → 문항 가중 평균 정답률로 추정
//     (이 칸에 1~2문항이 있으면 그 문항을 사전분포(k=2)와 섞어 정답률을 낸다)
//  마스터는 추정으로 주지 않는다 (잘함까지).
//
// 선수관계(diagnostics.prerequisites)는 비어 있어 아직 안 쓴다 — 채워지면 R4 로 붙일 자리.
// ============================================================================

import {
  type Band, type CellLevel, MIN_JUDGE, isWeakLevel, judgeCell, levelOfPct, cellKey,
} from './mastery-bands';

export interface ObservedCell {
  unit: string;
  band: string;
  n: number;
  correct: number;
}

export interface InferredCell {
  unit: string;
  band: string;
  level: CellLevel;
  pct: number;
  basis: string;
}

/** 사전분포로 섞을 가상 문항 수 — 1~2문항짜리 칸이 형제 평균에 끌려가는 정도 */
const PRIOR_K = 2;

/**
 * @param observed  실제 채점 문항이 있는 칸들 (학생 한 명 또는 반 전체)
 * @param universe  칸이 존재하는 (unit, band) 목록 — 문제은행에 문제가 있는 자리
 * @param unitsByMid 중단원 → 소단원 코드들
 * @param bands     열 순서 (쉬움 → 어려움)
 * @param names     소단원 이름 (근거 문장용)
 */
export function inferCells(
  observed: ObservedCell[],
  universe: Array<{ unit: string; band: string }>,
  unitsByMid: Map<string, string[]>,
  bands: readonly Band[],
  names: Map<string, string>,
): Map<string, InferredCell> {
  const obs = new Map<string, ObservedCell>();
  for (const c of observed) obs.set(cellKey(c.unit, c.band), c);

  const bandIndex = new Map(bands.map((b, i) => [b.key, i]));
  const bandLabel = new Map(bands.map((b) => [b.key, b.label]));
  const midOfUnit = new Map<string, string>();
  for (const [mid, units] of unitsByMid) for (const u of units) midOfUnit.set(u, mid);

  const judged = (unit: string, band: string) => {
    const c = obs.get(cellKey(unit, band));
    if (!c || c.n < MIN_JUDGE) return null;
    return { ...judgeCell(c.n, c.correct), n: c.n };
  };

  const out = new Map<string, InferredCell>();

  for (const { unit, band } of universe) {
    const key = cellKey(unit, band);
    const here = obs.get(key);
    // 판정이 서 있는 칸은 추정 대상이 아니다
    if (here && here.n >= MIN_JUDGE) continue;

    const bi = bandIndex.get(band);
    if (bi == null) continue;
    const uname = names.get(unit) ?? unit;

    // R1 — 더 어려운 밴드에서 잘하면 쉬운 밴드도 잘한다
    let hit: InferredCell | null = null;
    for (let j = bi + 1; j < bands.length && !hit; j += 1) {
      const harder = judged(unit, bands[j].key);
      if (harder && (harder.level === 'good' || harder.level === 'master')) {
        hit = {
          unit, band, level: 'good', pct: harder.pct ?? 80,
          basis: `${uname} · ${bandLabel.get(bands[j].key)} ${harder.pct}% (${harder.n}문항)에서 추정`,
        };
      }
    }
    // R2 — 더 쉬운 밴드가 약하면 어려운 밴드도 약하다
    for (let j = bi - 1; j >= 0 && !hit; j -= 1) {
      const easier = judged(unit, bands[j].key);
      if (easier && isWeakLevel(easier.level) && easier.level !== 'shaky') {
        hit = {
          unit, band, level: 'weak', pct: easier.pct ?? 40,
          basis: `${uname} · ${bandLabel.get(bands[j].key)} ${easier.pct}% (${easier.n}문항)에서 추정`,
        };
      }
    }
    // R3 — 같은 중단원 형제들의 같은 밴드
    if (!hit) {
      const mid = midOfUnit.get(unit);
      const siblings = (mid ? unitsByMid.get(mid) ?? [] : []).filter((u) => u !== unit);
      let n = 0; let correct = 0; let count = 0;
      for (const s of siblings) {
        const c = obs.get(cellKey(s, band));
        if (c && c.n >= MIN_JUDGE) { n += c.n; correct += c.correct; count += 1; }
      }
      if (count >= 2 && n > 0) {
        const prior = correct / n;
        let pct: number;
        let basis = `같은 중단원 ${count}개 소단원 · ${bandLabel.get(band)} 평균 ${Math.round(prior * 100)}% (${n}문항)에서 추정`;
        if (here && here.n > 0) {
          pct = Math.round(((here.correct + prior * PRIOR_K) * 100) / (here.n + PRIOR_K));
          basis = `이 칸 ${here.n}문항 ${Math.round((here.correct * 100) / here.n)}% + ${basis}`;
        } else {
          pct = Math.round(prior * 100);
        }
        let level = levelOfPct(pct, 0);
        if (level === 'master') level = 'good';
        hit = { unit, band, level, pct, basis };
      }
    }

    if (hit) out.set(key, hit);
  }
  return out;
}
