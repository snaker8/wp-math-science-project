// ============================================================================
// Difficulty Label — classifications.difficulty (1~10) → 학부모 친화 라벨
// 사용처: 학교별 분석 집계 대시보드 (학부모도 직관적으로 파악 가능하게)
// ============================================================================

export interface DifficultyBand {
  /** 1~10 정수 범위의 시작 */
  min: number;
  /** 1~10 정수 범위의 끝 (inclusive) */
  max: number;
  label: string;
  /** Tailwind 색 클래스 (text·bg·border 모두 같은 hue) */
  hue: 'emerald' | 'sky' | 'amber' | 'orange' | 'rose';
  /** 학부모 한 줄 설명 — 데이터 기반 사실만, 주관 X */
  hint: string;
}

/**
 * 5단계 밴드 — 4단계(평이/보통/난이도있음/매우난이도있음) 에서 한 단계 더 촘촘히.
 * 모든 학교·시험지에 동일 기준 적용 → 학부모가 다른 학교와 비교 가능.
 */
export const DIFFICULTY_BANDS: DifficultyBand[] = [
  { min: 1, max: 2, label: '기초', hue: 'emerald', hint: '교과서 기본 개념·계산 위주' },
  { min: 3, max: 4, label: '응용', hue: 'sky', hint: '개념을 가벼운 문제 상황에 적용' },
  { min: 5, max: 6, label: '심화', hue: 'amber', hint: '내신 평균 변별 — 두 개념 결합 정도' },
  { min: 7, max: 8, label: '고난도', hue: 'orange', hint: '상위권 변별 — 다단계 추론·복합 조건' },
  { min: 9, max: 10, label: '최고난도', hue: 'rose', hint: '최상위 변별 — 창의적 사고·정답률 낮음' },
];

/** 난이도 정수 1~10 → 밴드 매핑. 범위 밖이면 null. */
export function difficultyToBand(d: number | null | undefined): DifficultyBand | null {
  if (d == null || !Number.isFinite(d)) return null;
  const n = Math.round(d);
  if (n < 1 || n > 10) return null;
  return DIFFICULTY_BANDS.find((b) => n >= b.min && n <= b.max) || null;
}

/**
 * 평균 난이도 라벨 — 소수점까지 정확하게 표기.
 * 6.4 → "6.4 (심화)"
 */
export function formatAvgDifficulty(avg: number | null | undefined): {
  numeric: string;
  band: DifficultyBand | null;
} {
  if (avg == null || !Number.isFinite(avg)) return { numeric: '-', band: null };
  const rounded = Math.round(avg * 10) / 10;
  return {
    numeric: rounded.toFixed(1),
    band: difficultyToBand(avg),
  };
}

/**
 * Tailwind 색 클래스 매핑 — 다크 테마 기준.
 * 카드/배지/막대에서 일관된 색.
 */
export function difficultyHueClasses(hue: DifficultyBand['hue']): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  const map = {
    emerald: {
      text: 'text-emerald-300',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/40',
      bar: 'bg-emerald-500',
    },
    sky: {
      text: 'text-sky-300',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/40',
      bar: 'bg-sky-500',
    },
    amber: {
      text: 'text-amber-300',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/40',
      bar: 'bg-amber-500',
    },
    orange: {
      text: 'text-orange-300',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/40',
      bar: 'bg-orange-500',
    },
    rose: {
      text: 'text-rose-300',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/40',
      bar: 'bg-rose-500',
    },
  };
  return map[hue];
}

/**
 * 비교 코멘트 생성 — 학교 평균 vs 매칭 그룹 평균.
 * 데이터 기반: 차이를 그대로 서술. 주관 표현 X.
 *
 * 예: 학교 6.7 vs 그룹 5.8 → "그룹 평균 대비 +0.9 — 한 밴드 위"
 */
export function compareToGroup(schoolAvg: number, groupAvg: number): string {
  const diff = schoolAvg - groupAvg;
  const absDiff = Math.abs(diff);
  if (absDiff < 0.3) return '그룹 평균과 거의 동일';
  const sign = diff > 0 ? '+' : '−';
  const direction = diff > 0 ? '높음' : '낮음';
  if (absDiff < 1) return `그룹 평균 대비 ${sign}${absDiff.toFixed(1)} — 약간 ${direction}`;
  if (absDiff < 2) return `그룹 평균 대비 ${sign}${absDiff.toFixed(1)} — 한 밴드 차이`;
  return `그룹 평균 대비 ${sign}${absDiff.toFixed(1)} — 두 밴드 이상 ${direction}`;
}
