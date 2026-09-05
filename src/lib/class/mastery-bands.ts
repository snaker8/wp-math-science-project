// ============================================================================
// 숙달 매트릭스 — 난이도 층 · 유형 칸 완성도 · 칸 판정 · 코드 접두어 (순수 함수, 서버·클라 공용)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 5 · 매쓰홀릭 조사 08-type-analysis §1~2.
//
// ★ 판의 원리 (대표, 2026-09-04):
//   "우리 유형분석 판은 수학비서 코드로 분류된 유형별로 만들고, 거기에 난이도별로 문제들이
//    적층되어, 학생들이 그걸 풀었을 때 완성도 색이 변하는" 것.
//
//   판   = 과정(과목)의 수학비서 **유형(depth5)** 전체. 과정마다 고정. 채점의 산출물이 아니다.
//   칸   = 유형 하나. 칸 안에 난이도 4층(개념·기본·실력·심화)이 세로로 쌓인다.
//   층   = 그 유형의 그 난이도 문제들(문제은행 공급). 문제가 없는 층은 「문제 없음」(점선).
//   색   = 학생이 그 층의 문제를 풀면 찬다 — 얼마나 풀었나(완성도) + 맞았나(정답률).
//   완성도 두 개를 따로 잰다: 문제은행 완성도(문제 있는 유형/판) · 학습 진행도(푼 문제/있는 문제).
//
// 난이도 축: classifications.difficulty(1~10) 를 접는다. 경계는 실측 분포 기준 —
//   1~3: 3,801 · 4~5: 2,493 · 6~7: 926 · 8~10: 149  (7,369건, 2026-09-03)
//   매쓰홀릭식 1-3/4-6/7-8/9-10 이면 「심화」열에 21문제뿐이라 층이 통째로 빈다.
//   6단계는 매쓰홀릭과 같이 실력·심화를 하/중으로 쪼갠다.
// ============================================================================

export interface Band {
  key: string;
  label: string;
  /** classifications.difficulty 는 enum(문자열 '1'~'10') — `.in()` 에 그대로 넘긴다 */
  levels: string[];
}

export type BandScheme = 4 | 6;

export const BAND_SCHEMES: Record<BandScheme, readonly Band[]> = {
  4: [
    { key: 'A', label: '개념', levels: ['1', '2', '3'] },
    { key: 'B', label: '기본', levels: ['4', '5'] },
    { key: 'C', label: '실력', levels: ['6', '7'] },
    { key: 'D', label: '심화', levels: ['8', '9', '10'] },
  ],
  6: [
    { key: 'A', label: '개념', levels: ['1', '2', '3'] },
    { key: 'B', label: '기본', levels: ['4', '5'] },
    { key: 'C1', label: '실력 하', levels: ['6'] },
    { key: 'C2', label: '실력 중', levels: ['7'] },
    { key: 'D1', label: '심화 하', levels: ['8'] },
    { key: 'D2', label: '심화 중', levels: ['9', '10'] },
  ],
};

export function bandOf(difficulty: number | string | null | undefined, scheme: BandScheme = 4): string | null {
  if (difficulty == null || difficulty === '') return null;
  const d = typeof difficulty === 'number' ? difficulty : parseInt(String(difficulty), 10);
  if (!Number.isFinite(d)) return null;
  const s = String(d);
  for (const b of BAND_SCHEMES[scheme]) if (b.levels.includes(s)) return b.key;
  return null;
}

/**
 * 판정. 매쓰홀릭 범례(마스터·잘함·불안정·약점·심각·미학습·판정불가)를 우리 데이터로 옮긴 것.
 *
 * ★ 1~2문항에는 색 판정을 주지 않는다. student_node_status 3,950건 중 80%가 items_total=1 —
 *   한 문제 맞으면 α, 틀리면 γ 로 칠하면 소음이 신호처럼 보인다. 매쓰홀릭에도 「판정 불가」가 있다.
 *
 *  none    미학습 — 채점 문항 0
 *  thin    판정 보류 — 문항이 MIN_JUDGE 미만. 정답률은 보여 주되 판정은 안 한다
 *  master  n ≥ MIN_MASTER 이고 정답률 ≥ 90
 *  good    ≥ 80  ·  shaky 60~79  ·  weak 30~59  ·  severe < 30
 */
export type CellLevel = 'none' | 'thin' | 'master' | 'good' | 'shaky' | 'weak' | 'severe';

export const MIN_JUDGE = 3;
export const MIN_MASTER = 5;

export interface CellJudgement {
  level: CellLevel;
  /** 0~100, 문항 0이면 null */
  pct: number | null;
}

export function judgeCell(n: number, correct: number): CellJudgement {
  if (n <= 0) return { level: 'none', pct: null };
  const pct = Math.round((Math.max(0, Math.min(correct, n)) * 100) / n);
  if (n < MIN_JUDGE) return { level: 'thin', pct };
  return { level: levelOfPct(pct, n), pct };
}

/** 정답률 → 단계 (문항 수는 마스터 자격에만 쓴다) */
export function levelOfPct(pct: number, n: number = MIN_MASTER): CellLevel {
  if (pct >= 90 && n >= MIN_MASTER) return 'master';
  if (pct >= 80) return 'good';
  if (pct >= 60) return 'shaky';
  if (pct >= 30) return 'weak';
  return 'severe';
}

export const LEVEL_LABEL: Record<CellLevel, string> = {
  none: '미학습',
  thin: '판정 보류',
  master: '마스터',
  good: '잘함',
  shaky: '불안정',
  weak: '약점',
  severe: '심각',
};

/** 과제로 메꿀 만한 칸 — 색이 붙은 것 중 80 미만 */
export function isWeakLevel(level: CellLevel): boolean {
  return level === 'shaky' || level === 'weak' || level === 'severe';
}

// ── 유형 칸 = 층의 적층 ──────────────────────────────────────────────────────

/** 유형 칸의 한 층 — 문제은행 공급 · 학생이 푼 문제 · 맞힌 수 */
export interface TypeLayer {
  band: string;
  /** 문제은행에 있는 문제 수 (격리 통과분) */
  supply: number;
  /** 학생이 푼 서로 다른 문제 수 (공급을 넘지 않게 자른다) */
  solved: number;
  /** 채점 문항 수 (같은 문제를 두 번 풀면 2) */
  n: number;
  correct: number;
}

export interface TypeSummary {
  /** 문제가 있는 층 수 */
  layersWithSupply: number;
  /** 학생이 손댄 층 수 */
  layersTouched: number;
  supply: number;
  solved: number;
  n: number;
  correct: number;
  /** 학습 진행도 — 푼 문제 / 있는 문제 (0~100). 문제가 없으면 null */
  progressPct: number | null;
  /** 정답률 판정 (문항 수 기준) */
  judgement: CellJudgement;
}

export function summarizeType(layers: TypeLayer[]): TypeSummary {
  let layersWithSupply = 0; let layersTouched = 0;
  let supply = 0; let solved = 0; let n = 0; let correct = 0;
  for (const l of layers) {
    if (l.supply > 0) layersWithSupply += 1;
    if (l.n > 0) layersTouched += 1;
    supply += l.supply;
    solved += Math.min(l.solved, l.supply);
    n += l.n;
    correct += l.correct;
  }
  return {
    layersWithSupply, layersTouched, supply, solved, n, correct,
    progressPct: supply > 0 ? Math.round((solved * 100) / supply) : null,
    judgement: judgeCell(n, correct),
  };
}

/** 수학비서 코드 접두어 — 과목(MS05) · 중단원 depth3 · 소단원 depth4 */
export function subjectOf(code: string): string {
  return code.split('-')[0] ?? code;
}
export function midOf(code: string): string | null {
  const parts = code.split('-');
  return parts.length >= 3 ? parts.slice(0, 3).join('-') : null;
}
export function unitOf(code: string): string | null {
  const parts = code.split('-');
  return parts.length >= 4 ? parts.slice(0, 4).join('-') : null;
}
export function depthOf(code: string): number {
  return code.split('-').length;
}

/** 칸(유형) × 층(밴드) 식별자 */
export function cellKey(unit: string, band: string): string {
  return `${unit}|${band}`;
}
