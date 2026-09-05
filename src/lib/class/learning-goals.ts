// ============================================================================
// 학습 목표 · 달성률 · 주(週) 경계 (순수 함수, 서버·클라 공용)
// ----------------------------------------------------------------------------
// 매쓰홀릭 반 허브 실측 (docs/benchmark/matholic/10-course-hub-premium-deep.md §0):
//   설정 탭 「학습 목표 — 목표 학습량(문제수 50~300) · 목표 정답률(50~100)」을 **반 단위**로 정하고,
//   학생 탭은 그 목표 대비 달성률로 읽는다: `금주 학습량 0% 달성 0개/70개` · `평균 정답률 172% 달성 86점/50점`.
//   100% 초과도 그대로 보여준다(176%). 달성률을 ☀/🌤/☁ 날씨로 한 번 더 요약한다.
//
// 우리는 classes.settings.goals 에 저장한다 (컬럼 추가 없이). 값이 없으면 달성률·날씨를 안 그린다 —
// 목표 없이 "0% 달성"을 보여주는 건 거짓이다.
// ============================================================================

export interface LearningGoals {
  /** 주간 목표 학습량 — 채점 문항 수 */
  weeklyProblems: number | null;
  /** 목표 정답률 % */
  accuracy: number | null;
}

export const GOAL_LIMITS = {
  weeklyProblems: { min: 10, max: 500 },
  accuracy: { min: 50, max: 100 },
} as const;

/** classes.settings(jsonb) 에서 목표를 꺼낸다. 없거나 깨져 있으면 null 두 개 */
export function parseGoals(settings: unknown): LearningGoals {
  const g = settings && typeof settings === 'object' ? (settings as { goals?: unknown }).goals : null;
  const o = g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { weeklyProblems: num(o.weeklyProblems), accuracy: num(o.accuracy) };
}

/** 저장 전 검증 — 범위 밖이면 이유를 돌려준다 */
export function validateGoals(input: { weeklyProblems?: unknown; accuracy?: unknown }): { ok: true; goals: LearningGoals } | { ok: false; error: string } {
  const toNum = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };
  const w = toNum(input.weeklyProblems);
  const a = toNum(input.accuracy);
  if (Number.isNaN(w)) return { ok: false, error: '주간 학습량은 숫자여야 합니다' };
  if (Number.isNaN(a)) return { ok: false, error: '목표 정답률은 숫자여야 합니다' };
  if (typeof w === 'number' && (w < GOAL_LIMITS.weeklyProblems.min || w > GOAL_LIMITS.weeklyProblems.max)) {
    return { ok: false, error: `주간 학습량은 ${GOAL_LIMITS.weeklyProblems.min}~${GOAL_LIMITS.weeklyProblems.max}문항 사이로 정해 주세요` };
  }
  if (typeof a === 'number' && (a < GOAL_LIMITS.accuracy.min || a > GOAL_LIMITS.accuracy.max)) {
    return { ok: false, error: `목표 정답률은 ${GOAL_LIMITS.accuracy.min}~${GOAL_LIMITS.accuracy.max}% 사이로 정해 주세요` };
  }
  return { ok: true, goals: { weeklyProblems: w === undefined ? null : w, accuracy: a === undefined ? null : a } };
}

/** 달성률 % (목표 없으면 null). 100 초과도 그대로 — 매쓰홀릭 176% */
export function achievementPct(value: number | null, goal: number | null): number | null {
  if (goal == null || goal <= 0 || value == null) return null;
  return Math.round((value * 100) / goal);
}

/** 날씨 요약 — 맑음 ≥ 100 · 구름 조금 50~99 · 흐림 < 50 (매쓰홀릭 실측: 176%☀ · 71%🌤 · 0%☁ 에 맞춘 경계, 문서 미검증) */
export type Weather = 'sunny' | 'partly' | 'cloudy';
export function weatherOf(pct: number | null): Weather | null {
  if (pct == null) return null;
  if (pct >= 100) return 'sunny';
  if (pct >= 50) return 'partly';
  return 'cloudy';
}
export const WEATHER_LABEL: Record<Weather, string> = { sunny: '맑음', partly: '구름 조금', cloudy: '흐림' };

// ── 주 경계 (KST, 월요일 시작) ─────────────────────────────────────────────
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 시각이 속한 KST 주의 월요일 00:00(KST) 를 UTC ms 로 */
export function weekStartKST(at: string | number | Date): number {
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  const kst = new Date(t + KST_OFFSET_MS);
  const dow = kst.getUTCDay();               // 0 일 … 6 토 (KST 기준)
  const back = (dow + 6) % 7;                // 월요일까지 되돌아갈 일수
  const monday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - back);
  return monday - KST_OFFSET_MS;
}

/** 주 식별 키 — "2026-09-01" 처럼 그 주 월요일의 KST 날짜 */
export function weekKeyKST(at: string | number | Date): string {
  const monday = new Date(weekStartKST(at) + KST_OFFSET_MS);
  return monday.toISOString().slice(0, 10);
}
