// ============================================================================
// 자동 출제 — 후보 다듬기(유형별 상한) + 뽑기 방식 (2026-10-14, 매쓰홀릭 유형별 출제 등가)
// ----------------------------------------------------------------------------
// 매쓰홀릭 1단계(12-rea-unit-group.md §2·§4): 유형별 문제수 1~4(상한) · 최대 문제수 · 출제 방식
//   무작위 / 소단원별 균등 / 단원·난이도별 맞춤 / 난이도별 맞춤. 선정은 전부 클라이언트 JS.
// 우리는 서버(generate)에서 같은 규칙으로 뽑는다. available-counts 는 같은 상한을 적용해 「선택 N」을 센다.
//
// 순수 함수 — DB 안 본다. rows 는 classifications(problem_id, type_code, difficulty) 이미 접근성·중복출제 필터를 거친 것.
// ============================================================================

import { LEVELS_BY_BAND_LABEL } from '@/lib/class/mastery-bands';

export type SelectionMode = 'band' | 'random' | 'even';
export const SELECTION_MODES: SelectionMode[] = ['band', 'random', 'even'];

export interface PoolRow {
  problem_id: string;
  type_code: string;
  difficulty: unknown;
}

export const MAX_PER_TYPE_CAP = 4;

export function parseSelectionMode(v: unknown): SelectionMode {
  return SELECTION_MODES.includes(v as SelectionMode) ? (v as SelectionMode) : 'band';
}

/** 0 = 상한 없음(전체), 1~4 */
export function parsePerTypeCap(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_PER_TYPE_CAP, Math.floor(n));
}

const bandOfLevel = new Map<string, string>();
for (const [label, levels] of Object.entries(LEVELS_BY_BAND_LABEL)) levels.forEach((l) => bandOfLevel.set(String(l), label));

/** 난이도(1~10) → 5단 라벨. 없으면 '기본' 쪽으로 (예전 generate 의 '3' 기본값과 같은 뜻) */
export function bandOfRow(row: PoolRow): string {
  return bandOfLevel.get(String(row.difficulty ?? '3')) ?? bandOfLevel.get('3') ?? '기본';
}

/** 소단원 키 — MS 코드 앞 4세그먼트 (MS07-01-03-02-05 → MS07-01-03-02) */
export function unitKeyOf(typeCode: string): string {
  return typeCode.split('-').slice(0, 4).join('-');
}

export type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 유형별 상한 — 유형(type_code 전체)마다 최대 cap 문항만 남긴다. cap<=0 이면 그대로.
 * 같은 problem_id 가 두 유형에 걸려 있어도 한 번만 센다.
 * rng 를 고정(예: () => 0)하면 결정적(available-counts 의 표시용), Math.random 이면 매번 다른 문항(generate).
 */
export function capPerType(rows: PoolRow[], cap: number, rng: Rng = Math.random): PoolRow[] {
  if (cap <= 0) return dedupeRows(rows);
  const byType = new Map<string, PoolRow[]>();
  for (const r of rows) {
    if (!byType.has(r.type_code)) byType.set(r.type_code, []);
    byType.get(r.type_code)!.push(r);
  }
  const out: PoolRow[] = [];
  const seen = new Set<string>();
  for (const list of byType.values()) {
    const ordered = rng === deterministicRng ? [...list].sort((a, b) => a.problem_id.localeCompare(b.problem_id)) : shuffle(list, rng);
    let n = 0;
    for (const r of ordered) {
      if (n >= cap) break;
      if (seen.has(r.problem_id)) continue;
      seen.add(r.problem_id); out.push(r); n++;
    }
  }
  return out;
}

/** 표시용 결정적 순서 — capPerType 에 넘기면 problem_id 순으로 앞 cap 개 */
export const deterministicRng: Rng = () => 0;

function dedupeRows(rows: PoolRow[]): PoolRow[] {
  const seen = new Set<string>();
  const out: PoolRow[] = [];
  for (const r of rows) { if (!seen.has(r.problem_id)) { seen.add(r.problem_id); out.push(r); } }
  return out;
}

/** 묶음들을 돌아가며 하나씩 꺼내 n 개 — 묶음이 비면 건너뛴다 */
export function roundRobinPick(groups: PoolRow[][], n: number): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  const cursors = groups.map(() => 0);
  let progressed = true;
  while (out.length < n && progressed) {
    progressed = false;
    for (let g = 0; g < groups.length && out.length < n; g++) {
      const list = groups[g];
      while (cursors[g] < list.length) {
        const r = list[cursors[g]++];
        if (used.has(r.problem_id)) continue;
        used.add(r.problem_id); out.push(r.problem_id); progressed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * 난이도별 맞춤 — 유형별 최소(typeMins)를 먼저 채우고(남은 배분이 큰 밴드부터), 밴드별 배분(bandDist)을 채운다.
 * 밴드가 모자라면 전체에서 채운다. (generate 의 예전 규칙을 그대로 옮김)
 */
export function pickByBand(
  rows: PoolRow[],
  bandDist: Record<string, number>,
  typeMins: Record<string, number> = {},
  rng: Rng = Math.random,
): { ids: string[]; log: string[] } {
  const log: string[] = [];
  const ids: string[] = [];
  const used = new Set<string>();
  const remaining: Record<string, number> = { ...bandDist };

  for (const [code, need] of Object.entries(typeMins)) {
    const pool = shuffle(rows.filter((r) => !used.has(r.problem_id) && r.type_code.startsWith(code)), rng)
      .sort((a, b) => ((remaining[bandOfRow(a)] ?? 0) < (remaining[bandOfRow(b)] ?? 0) ? 1 : -1));
    let picked = 0;
    for (const row of pool) {
      if (picked >= need) break;
      ids.push(row.problem_id); used.add(row.problem_id);
      const band = bandOfRow(row);
      if ((remaining[band] ?? 0) > 0) remaining[band] -= 1;
      picked++;
    }
    log.push(`유형 ${code}: needed=${need}, picked=${picked}, pool=${pool.length}`);
  }

  const byBand = new Map<string, PoolRow[]>();
  for (const r of rows) { const b = bandOfRow(r); if (!byBand.has(b)) byBand.set(b, []); byBand.get(b)!.push(r); }

  for (const [band, count] of Object.entries(remaining)) {
    if (count <= 0) continue;
    const pool = byBand.get(band) ?? [];
    let picked = 0;
    for (const row of shuffle(pool, rng)) {
      if (picked >= count) break;
      if (used.has(row.problem_id)) continue;
      ids.push(row.problem_id); used.add(row.problem_id); picked++;
    }
    if (picked < count) {
      for (const row of shuffle(rows.filter((r) => !used.has(r.problem_id)), rng)) {
        if (picked >= count) break;
        ids.push(row.problem_id); used.add(row.problem_id); picked++;
      }
    }
    log.push(`난이도 ${band}: needed=${count}, picked=${picked}, pool=${pool.length}`);
  }
  return { ids, log };
}

/** 무작위 — 밴드를 돌아가며 뽑아 난이도가 한쪽으로 쏠리지 않게 (매쓰홀릭 "밴드마다 균등 할당"의 뜻) */
export function pickRandom(rows: PoolRow[], n: number, rng: Rng = Math.random): string[] {
  const byBand = new Map<string, PoolRow[]>();
  for (const r of shuffle(rows, rng)) { const b = bandOfRow(r); if (!byBand.has(b)) byBand.set(b, []); byBand.get(b)!.push(r); }
  const order = Object.keys(LEVELS_BY_BAND_LABEL);
  const groups = order.filter((b) => byBand.has(b)).map((b) => byBand.get(b)!);
  return roundRobinPick(groups, n);
}

/** 소단원별 균등 — 소단원(앞 4세그먼트)을 돌아가며 뽑는다. 소단원 안에서는 무작위 */
export function pickEvenByUnit(rows: PoolRow[], n: number, rng: Rng = Math.random): string[] {
  const byUnit = new Map<string, PoolRow[]>();
  for (const r of shuffle(rows, rng)) { const u = unitKeyOf(r.type_code); if (!byUnit.has(u)) byUnit.set(u, []); byUnit.get(u)!.push(r); }
  const groups = [...byUnit.keys()].sort().map((u) => byUnit.get(u)!);
  return roundRobinPick(groups, n);
}

/** 최종 정렬 — 난이도 오름순(앞은 쉽고 뒤로 갈수록 어렵게), 같은 난이도면 유형 코드 순. 예전 난이도별 뽑기의 순서와 같은 느낌 */
export function orderForPaper(ids: string[], rows: PoolRow[]): string[] {
  const info = new Map<string, PoolRow>();
  for (const r of rows) if (!info.has(r.problem_id)) info.set(r.problem_id, r);
  const diff = (id: string) => { const d = parseInt(String(info.get(id)?.difficulty ?? '3'), 10); return Number.isFinite(d) ? d : 3; };
  return [...ids].sort((a, b) => {
    const da = diff(a), db = diff(b);
    if (da !== db) return da - db;
    const ta = info.get(a)?.type_code ?? ''; const tb = info.get(b)?.type_code ?? '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}
