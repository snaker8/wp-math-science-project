// ============================================================================
// 숙달 매트릭스 — 난이도 밴드 · 칸 판정 · 코드 접두어 (순수 함수, 서버·클라 공용)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 5 · 매쓰홀릭 조사 08-type-analysis §1~2.
//
// 매쓰홀릭 유형분석 = 「행=소단원 × 열=난이도(4/6단계), 칸=유형 하나, 색=그 학생의 숙달」.
// 대표 지시(2026-09-04): 우리 데이터에 맞춰 깎지 말고 **매쓰홀릭 수준까지 만든다.**
//
// 트리 대응 (실측 2026-09-03, 중3-1 기준):
//   매쓰홀릭 행(소단원, 확통 ~30개)  ↔  우리 depth3 중단원 27개
//   매쓰홀릭 칸(유형, 확통 457개)    ↔  우리 depth4 소단원 227개 × 난이도 밴드
//   (우리 depth5 세부유형은 1,657개 — 매쓰홀릭 유형의 3.6배로 잘아서 칸으로 쓰면
//    학생 한 명이 건드린 게 3.7% 뿐이다. 칸은 depth4 로 두고 세부유형은 칸 안에서 본다.)
//
// 난이도 축: classifications.difficulty(1~10) 를 접는다. 경계는 실측 분포 기준 —
//   1~3: 3,801 · 4~5: 2,493 · 6~7: 926 · 8~10: 149  (7,369건)
//   매쓰홀릭식 1-3/4-6/7-8/9-10 이면 「심화」열에 21문제뿐이라 열이 통째로 빈다.
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
 * 칸 판정. 매쓰홀릭 범례(마스터·잘함·불안정·약점·심각·미학습·판정불가)를 우리 데이터로 옮긴 것.
 *
 * ★ 1~2문항에는 색을 주지 않는다. student_node_status 3,950건 중 80%가 items_total=1 —
 *   한 문제 맞으면 α, 틀리면 γ 로 칠하면 소음이 신호처럼 보인다. 매쓰홀릭에도 「판정 불가」가 있다.
 *   대신 추정(mastery-infer)이 형제 칸 근거로 원형 칸을 채운다.
 *
 *  none    미학습 — 채점 문항 0
 *  thin    판정 보류 — 문항이 MIN_JUDGE 미만. 정답률은 보여 주되 색은 주지 않는다
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

/** 수학비서 코드 접두어 — 과목(MS05) · 중단원 depth3(MS05-06-02) · 소단원 depth4(MS05-06-02-01) */
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

/** 칸 식별자 — 소단원 × 밴드 */
export function cellKey(unit: string, band: string): string {
  return `${unit}|${band}`;
}
